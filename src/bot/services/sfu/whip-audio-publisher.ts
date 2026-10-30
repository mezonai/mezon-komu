import axios from 'axios';
import { randomBytes } from 'crypto';
import { setTimeout as delay } from 'timers/promises';
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RtpHeader,
  RtpPacket,
} from 'werift';
import { getOpusDurationSamples, readOggOpusPackets } from './ogg-opus-reader';

const CONNECT_TIMEOUT_MS = 15_000;
const OPUS_CLOCK_RATE = 48_000;
const MAX_CATCH_UP_MS = 40;

interface WhipAudioPublisherOptions {
  whipUrl: string;
  token: string;
  mediaUrl: string;
  onEnded?: (error?: Error) => void;
}

export class WhipAudioPublisher {
  private peerConnection?: RTCPeerConnection;
  private audioTrack?: MediaStreamTrack;
  private mediaStream?: NodeJS.ReadableStream;
  private resourceUrl?: string;
  private readonly abortController = new AbortController();
  private stopping = false;
  private finished = false;

  constructor(private readonly options: WhipAudioPublisherOptions) {}

  async start(): Promise<void> {
    if (!this.options.token.trim()) {
      throw new Error('WHIP token is empty.');
    }
    if (!this.options.whipUrl.trim()) {
      throw new Error('WHIP URL is empty.');
    }

    try {
      // 1. Fetch the media file stream (Ogg Opus)
      const response = await axios.get<NodeJS.ReadableStream>(
        this.options.mediaUrl,
        {
          responseType: 'stream',
          signal: this.abortController.signal,
        },
      );
      this.mediaStream = response.data;

      // 2. Setup RTCPeerConnection
      const pc = new RTCPeerConnection();
      this.peerConnection = pc;

      const audioTrack = new MediaStreamTrack({ kind: 'audio' });
      this.audioTrack = audioTrack;
      pc.addTransceiver(audioTrack, { direction: 'sendonly' });

      const connectedPromise = new Promise<void>((resolve, reject) => {
        pc.connectionStateChange.subscribe((state) => {
          if (state === 'connected') {
            resolve();
          } else if (state === 'failed' || state === 'closed') {
            if (!this.stopping) {
              const err = new Error(`WHIP WebRTC connection ${state}.`);
              reject(err);
              void this.finish(err);
            }
          }
        });
      });

      // 3. Create Offer & gather ICE candidates
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.waitForIceGatheringComplete(pc, 2000);
      const offerSdp = pc.localDescription?.sdp || offer.sdp;

      // 4. POST SDP Offer to WHIP endpoint
      const whipRes = await axios.post<string>(this.options.whipUrl, offerSdp, {
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${this.options.token}`,
        },
        timeout: CONNECT_TIMEOUT_MS,
      });

      if (whipRes.status !== 200 && whipRes.status !== 201) {
        throw new Error(
          `WHIP server responded with HTTP status ${whipRes.status}`,
        );
      }

      // Save Location header for termination
      const locHeader = whipRes.headers['location'] || whipRes.headers['Location'];
      if (locHeader) {
        this.resourceUrl = new URL(locHeader, this.options.whipUrl).toString();
      }

      const answerSdp = whipRes.data;
      if (!answerSdp || typeof answerSdp !== 'string') {
        throw new Error('WHIP server returned empty SDP answer.');
      }

      // 5. Set Remote SDP Answer
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      // Wait for WebRTC DTLS/ICE handshake to connect
      const timeout = setTimeout(() => {
        throw new Error('Timed out while connecting to WHIP WebRTC peer.');
      }, CONNECT_TIMEOUT_MS);

      try {
        await connectedPromise;
      } finally {
        clearTimeout(timeout);
      }

      // 6. Pump audio packets
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

    this.audioTrack?.stop();
    this.audioTrack = undefined;

    const pc = this.peerConnection;
    this.peerConnection = undefined;
    if (pc) {
      await pc.close().catch(() => undefined);
    }

    // Call DELETE on WHIP resource URL if available
    if (this.resourceUrl) {
      const url = this.resourceUrl;
      this.resourceUrl = undefined;
      try {
        await axios.delete(url, {
          headers: {
            Authorization: `Bearer ${this.options.token}`,
          },
          timeout: 5000,
        });
      } catch {
        // Ignore deletion errors on shutdown
      }
    }
  }

  private async waitForIceGatheringComplete(
    pc: RTCPeerConnection,
    timeoutMs: number,
  ): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, timeoutMs);

      pc.iceGatheringStateChange.subscribe((state) => {
        if (state === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  private async pumpAudio(): Promise<void> {
    if (!this.mediaStream || !this.audioTrack) {
      throw new Error('WHIP publisher was not initialized.');
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
              payloadType: 96, // Opus payload type in werift SDP offer
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
