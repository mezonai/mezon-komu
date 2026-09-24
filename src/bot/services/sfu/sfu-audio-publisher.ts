import axios from 'axios';
import { randomBytes } from 'crypto';
import { setTimeout as delay } from 'timers/promises';
import WebSocket, { RawData } from 'ws';
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket,
} from 'werift';
import { getOpusDurationSamples, readOggOpusPackets } from './ogg-opus-reader';

const CONNECT_TIMEOUT_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const OPUS_CLOCK_RATE = 48_000;
const MAX_CATCH_UP_MS = 40;

interface SfuSignal {
  type?: string;
  sdp?: string;
  offer_generation?: number;
  message?: string;
  iceServers?: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

interface SfuAudioPublisherOptions {
  signalingUrl: string;
  roomId: string;
  token: string;
  mediaUrl: string;
  onEnded?: (error?: Error) => void;
}

export class SfuAudioPublisher {
  private websocket?: WebSocket;
  private peerConnection?: RTCPeerConnection;
  private audioTrack?: MediaStreamTrack;
  private mediaStream?: NodeJS.ReadableStream;
  private heartbeat?: NodeJS.Timeout;
  private readonly abortController = new AbortController();
  private signalQueue = Promise.resolve();
  private connected = false;
  private stopping = false;
  private finished = false;
  private resolveConnected?: () => void;
  private rejectConnected?: (error: Error) => void;

  constructor(private readonly options: SfuAudioPublisherOptions) {}

  async start(): Promise<void> {
    if (!this.options.token.trim()) {
      throw new Error('Mezon returned an empty SFU meet token.');
    }

    try {
      const response = await axios.get<NodeJS.ReadableStream>(
        this.options.mediaUrl,
        {
          responseType: 'stream',
          signal: this.abortController.signal,
        },
      );
      this.mediaStream = response.data;

      const connectedPromise = new Promise<void>((resolve, reject) => {
        this.resolveConnected = resolve;
        this.rejectConnected = reject;
      });
      await this.openSignalingSocket();

      const timeout = setTimeout(() => {
        this.rejectConnected?.(
          new Error('Timed out while connecting to the Mezon SFU.'),
        );
      }, CONNECT_TIMEOUT_MS);

      try {
        await connectedPromise;
      } finally {
        clearTimeout(timeout);
      }

      this.connected = true;
      void this.pumpAudio()
        .then(() => this.finish())
        .catch((error) => this.finish(asError(error)));
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.abortController.abort();

    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }

    const websocket = this.websocket;
    this.websocket = undefined;
    if (
      websocket &&
      (websocket.readyState === WebSocket.OPEN ||
        websocket.readyState === WebSocket.CONNECTING)
    ) {
      websocket.close();
    }

    this.audioTrack?.stop();
    this.audioTrack = undefined;

    const peerConnection = this.peerConnection;
    this.peerConnection = undefined;
    if (peerConnection) {
      await peerConnection.close();
    }
  }

  private async openSignalingSocket(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const websocket = new WebSocket(this.options.signalingUrl, {
        headers: { 'User-Agent': 'mezon-komu/1.0' },
      });
      this.websocket = websocket;

      const handleInitialError = (error: Error) => {
        websocket.off('open', handleOpen);
        reject(error);
      };
      const handleOpen = () => {
        websocket.off('error', handleInitialError);
        this.sendJson({
          type: 'join',
          room: this.options.roomId,
          token: this.options.token,
          role: 'speaker',
        });
        this.heartbeat = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            this.sendJson({ type: 'ping' });
          }
        }, HEARTBEAT_INTERVAL_MS);
        resolve();
      };

      websocket.once('error', handleInitialError);
      websocket.once('open', handleOpen);
      websocket.on('message', (data: RawData, isBinary: boolean) => {
        if (isBinary || this.stopping) return;
        this.signalQueue = this.signalQueue
          .then(() => this.handleSignal(data.toString()))
          .catch((error) => this.handleTransportFailure(asError(error)));
      });
      websocket.on('error', (error) => {
        this.handleTransportFailure(asError(error));
      });
      websocket.on('close', () => {
        if (!this.stopping) {
          this.handleTransportFailure(
            new Error('Mezon SFU signaling socket closed.'),
          );
        }
      });
    });
  }

  private async handleSignal(payload: string): Promise<void> {
    const message = JSON.parse(payload) as SfuSignal;

    switch (message.type) {
      case 'joined':
        this.attachPeerConnection(message.iceServers ?? []);
        break;
      case 'offer':
        await this.answerOffer(message);
        break;
      case 'ping':
        this.sendJson({ type: 'pong' });
        break;
      case 'error':
        throw new Error(
          message.message
            ? 'Mezon SFU rejected publisher: ' + message.message
            : 'Mezon SFU rejected publisher signaling.',
        );
      case 'pong':
      case 'peer_joined':
      case 'peer_left':
      case 'peer_updated':
      case 'mute_changed':
        break;
    }
  }

  private attachPeerConnection(iceServers: SfuSignal['iceServers']): void {
    if (this.peerConnection) return;

    const peerConnection = new RTCPeerConnection({ iceServers });
    const audioTrack = new MediaStreamTrack({ kind: 'audio' });
    peerConnection.addTransceiver(audioTrack, { direction: 'sendonly' });

    peerConnection.connectionStateChange.subscribe((state) => {
      if (state === 'connected') {
        this.resolveConnected?.();
        return;
      }

      if (state === 'failed' || state === 'closed') {
        this.handleTransportFailure(
          new Error('Mezon SFU WebRTC connection ' + state + '.'),
        );
      }
    });

    this.peerConnection = peerConnection;
    this.audioTrack = audioTrack;
  }

  private async answerOffer(message: SfuSignal): Promise<void> {
    if (!message.sdp) {
      throw new Error('Mezon SFU sent an empty offer.');
    }
    if (!this.peerConnection) {
      throw new Error('Mezon SFU sent an offer before joined.');
    }

    await this.peerConnection.setRemoteDescription({
      type: 'offer',
      sdp: message.sdp,
    });
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.sendJson({
      type: 'answer',
      sdp: this.peerConnection.localDescription?.sdp ?? answer.sdp,
      offer_generation: message.offer_generation ?? 0,
    });
  }

  private async pumpAudio(): Promise<void> {
    if (!this.mediaStream || !this.audioTrack) {
      throw new Error('SFU publisher was not initialized.');
    }

    let sequenceNumber = randomBytes(2).readUInt16BE(0);
    let timestamp = randomBytes(4).readUInt32BE(0);
    const ssrc = randomBytes(4).readUInt32BE(0);
    let sentSamples = 0;
    let timelineStartedAt = performance.now();
    let firstPacket = true;

    try {
      for await (const payload of readOggOpusPackets(this.mediaStream)) {
        const dueAt =
          timelineStartedAt + (sentSamples * 1000) / OPUS_CLOCK_RATE;
        const waitMs = dueAt - performance.now();
        if (waitMs > 0) {
          await delay(waitMs, undefined, {
            signal: this.abortController.signal,
          });
        }

        this.audioTrack.writeRtp(
          new RtpPacket(
            new RtpHeader({
              marker: firstPacket,
              payloadType: 111,
              sequenceNumber,
              timestamp,
              ssrc,
            }),
            payload,
          ),
        );

        firstPacket = false;
        sequenceNumber = (sequenceNumber + 1) & 0xffff;
        const duration = getOpusDurationSamples(payload);
        timestamp = (timestamp + duration) >>> 0;
        sentSamples += duration;

        const expectedNow =
          timelineStartedAt + (sentSamples * 1000) / OPUS_CLOCK_RATE;
        const lag = performance.now() - expectedNow;
        if (lag > MAX_CATCH_UP_MS) {
          timelineStartedAt += lag;
        }
      }
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      throw error;
    }
  }

  private sendJson(message: object): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('Mezon SFU signaling socket is not open.');
    }
    this.websocket.send(JSON.stringify(message));
  }

  private handleTransportFailure(error: Error): void {
    if (this.stopping) return;

    if (!this.connected) {
      this.rejectConnected?.(error);
      return;
    }

    void this.finish(error);
  }

  private async finish(error?: Error): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.close();
    this.options.onEnded?.(error);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
