import axios from 'axios';
import { randomBytes } from 'crypto';
import { setTimeout as delay } from 'timers/promises';
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RTCRtpCodecParameters,
  RtpHeader,
  RtpPacket,
} from 'werift';
import { getOpusDurationSamples, readOggOpusPackets } from './ogg-opus-reader';
import { H264AccessUnitReader } from './h264-access-unit-reader';
import { H264RtpSender } from './h264-rtp-sender';

const CONNECT_TIMEOUT_MS = 15_000;
const OPUS_CLOCK_RATE = 48_000;
const VIDEO_CLOCK_RATE = 90_000;
const VIDEO_FPS = 30;
const VIDEO_FRAME_DURATION_TIMESTAMP = VIDEO_CLOCK_RATE / VIDEO_FPS; // 3000
const VIDEO_FRAME_SAMPLES = OPUS_CLOCK_RATE / VIDEO_FPS; // 1600
const MAX_CATCH_UP_MS = 40;
const SILENCE_OPUS_PACKET = Buffer.from([0xf8, 0xff, 0xfe]);
const SILENCE_SAMPLES = 960;

export interface WhipMediaPublisherOptions {
  whipUrl: string;
  token: string;
  audioStream: NodeJS.ReadableStream;
  videoStream?: NodeJS.ReadableStream;
  onEnded?: (error?: Error) => void;
}

export class WhipMediaPublisher {
  private peerConnection?: RTCPeerConnection;
  private audioTrack?: MediaStreamTrack;
  private videoTrack?: MediaStreamTrack;
  private audioSsrc?: number;
  private videoSsrc?: number;
  private resourceUrl?: string;
  private lastAudioSequenceNumber?: number;
  private lastAudioTimestamp?: number;
  private readonly abortController = new AbortController();
  private stopping = false;
  private finished = false;
  private audioMediaSamples = 0;
  private audioStarted = false;
  private audioFinished = false;

  constructor(private readonly options: WhipMediaPublisherOptions) {}

  async start(): Promise<void> {
    if (!this.options.token.trim()) {
      throw new Error('WHIP token is empty.');
    }
    if (!this.options.whipUrl.trim()) {
      throw new Error('WHIP URL is empty.');
    }

    try {
      const hasVideo = !!this.options.videoStream;

      // 1. Setup RTCPeerConnection with Opus and H.264 codecs
      const pc = new RTCPeerConnection({
        codecs: {
          audio: [
            new RTCRtpCodecParameters({
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
              payloadType: 111,
            }),
          ],
          video: hasVideo
            ? [
                new RTCRtpCodecParameters({
                  mimeType: 'video/H264',
                  clockRate: 90000,
                  rtcpFeedback: [
                    { type: 'nack' },
                    { type: 'nack', parameter: 'pli' },
                    { type: 'goog-remb' },
                  ],
                  parameters:
                    'packetization-mode=1;profile-level-id=42e028;level-asymmetry-allowed=1',
                  payloadType: 96,
                }),
              ]
            : undefined,
        },
      });
      this.peerConnection = pc;

      // Add audio transceiver
      const audioTrack = new MediaStreamTrack({ kind: 'audio' });
      this.audioTrack = audioTrack;
      const audioTransceiver = pc.addTransceiver(audioTrack, { direction: 'sendonly' });

      // Add video transceiver if video is provided
      let videoTransceiver: any;
      if (hasVideo) {
        const videoTrack = new MediaStreamTrack({ kind: 'video' });
        this.videoTrack = videoTrack;
        videoTransceiver = pc.addTransceiver(videoTrack, { direction: 'sendonly' });
      }

      this.audioSsrc = audioTransceiver.sender.ssrc;
      if (videoTransceiver) {
        this.videoSsrc = videoTransceiver.sender.ssrc;
      }

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

      // 2. Create Offer & gather ICE candidates
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.waitForIceGatheringComplete(pc, 2000);
      const offerSdp = pc.localDescription?.sdp || offer.sdp;

      // 3. POST SDP Offer to WHIP endpoint
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

      const locHeader =
        whipRes.headers['location'] ||
        whipRes.headers['Location'] ||
        (whipRes.headers as any)?.get?.('location');
      console.log('WHIP POST response status:', whipRes.status, 'Location header:', locHeader);
      if (locHeader) {
        this.resourceUrl = new URL(locHeader, this.options.whipUrl).toString();
        console.log('Saved WHIP resourceUrl for session teardown:', this.resourceUrl);
      } else {
        console.warn('WARNING: WHIP server returned NO Location header! Headers:', whipRes.headers);
      }

      const answerSdp = whipRes.data;
      if (!answerSdp || typeof answerSdp !== 'string') {
        throw new Error('WHIP server returned empty SDP answer.');
      }

      // 4. Set Remote SDP Answer
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      // 5. Wait for WebRTC handshake
      const timeout = setTimeout(() => {
        throw new Error('Timed out while connecting to WHIP WebRTC peer.');
      }, CONNECT_TIMEOUT_MS);

      try {
        await connectedPromise;
      } finally {
        clearTimeout(timeout);
      }

      // 6. Pump media streams
      void this.pumpMedia()
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

    // 0. Overwrite edge server ring buffer with silence before terminating session
    if (
      this.audioTrack &&
      this.audioSsrc !== undefined &&
      this.lastAudioSequenceNumber !== undefined &&
      this.lastAudioTimestamp !== undefined
    ) {
      try {
        let seq = (this.lastAudioSequenceNumber + 1) & 0xffff;
        let ts = (this.lastAudioTimestamp + SILENCE_SAMPLES) >>> 0;
        for (let i = 0; i < 40; i++) {
          this.audioTrack.writeRtp(
            new RtpPacket(
              new RtpHeader({
                marker: false,
                payloadType: 111,
                sequenceNumber: seq,
                timestamp: ts,
                ssrc: this.audioSsrc,
              }),
              SILENCE_OPUS_PACKET,
            ),
          );
          seq = (seq + 1) & 0xffff;
          ts = (ts + SILENCE_SAMPLES) >>> 0;
        }
      } catch {}
    }

    // 1. First, tell the streaming server to terminate the WHIP publish session immediately
    if (this.resourceUrl) {
      const url = this.resourceUrl;
      this.resourceUrl = undefined;
      try {
        console.log('Sending DELETE to WHIP resource URL:', url);
        const delRes = await axios.delete(url, {
          headers: {
            Authorization: `Bearer ${this.options.token}`,
          },
          timeout: 4000,
        });
        console.log('WHIP DELETE response status:', delRes.status);
      } catch (err: any) {
        console.warn('WHIP DELETE failed:', err?.response?.status || err?.message);
      }
    } else {
      console.warn('Cannot send DELETE to WHIP because resourceUrl is undefined.');
    }

    // 2. Stop local tracks
    this.audioTrack?.stop();
    this.audioTrack = undefined;
    this.videoTrack?.stop();
    this.videoTrack = undefined;

    // 3. Close peer connection
    const pc = this.peerConnection;
    this.peerConnection = undefined;
    if (pc) {
      await pc.close().catch(() => undefined);
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

  private async pumpMedia(): Promise<void> {
    const audioPromise = this.pumpAudio();
    const videoPromise = this.videoTrack && this.options.videoStream
      ? this.pumpVideo(this.videoTrack, this.options.videoStream)
      : Promise.resolve();

    await Promise.all([audioPromise, videoPromise]);
  }

  private async pumpAudio(): Promise<void> {
    if (!this.audioTrack) {
      throw new Error('Audio track is not initialized.');
    }

    let sequenceNumber = randomBytes(2).readUInt16BE(0);
    let timestamp = randomBytes(4).readUInt32BE(0);
    const ssrc = this.audioSsrc ?? randomBytes(4).readUInt32BE(0);
    let sentSamples = 0;
    let timelineStartedAt = performance.now();
    let firstPacket = true;

    this.lastAudioSequenceNumber = sequenceNumber;
    this.lastAudioTimestamp = timestamp;

    // 1. Prime stream and flush edge jitter buffer with silence
    for (let i = 0; i < 20; i++) {
      this.audioTrack.writeRtp(
        new RtpPacket(
          new RtpHeader({
            marker: firstPacket,
            payloadType: 111,
            sequenceNumber,
            timestamp,
            ssrc,
          }),
          SILENCE_OPUS_PACKET,
        ),
      );
      firstPacket = false;
      sequenceNumber = (sequenceNumber + 1) & 0xffff;
      timestamp = (timestamp + SILENCE_SAMPLES) >>> 0;
      sentSamples += SILENCE_SAMPLES;
    }
    this.lastAudioSequenceNumber = sequenceNumber;
    this.lastAudioTimestamp = timestamp;

    this.audioMediaSamples = 0;
    this.audioStarted = true;

    try {
      for await (const payload of readOggOpusPackets(this.options.audioStream)) {
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
        this.audioMediaSamples += duration;
        this.lastAudioSequenceNumber = sequenceNumber;
        this.lastAudioTimestamp = timestamp;

        const expectedNow =
          timelineStartedAt + (sentSamples * 1000) / OPUS_CLOCK_RATE;
        const lag = performance.now() - expectedNow;
        if (lag > MAX_CATCH_UP_MS) {
          timelineStartedAt += lag;
        }
      }

      // 2. Flush trailing silence when track reaches normal EOF
      for (let i = 0; i < 40; i++) {
        this.audioTrack.writeRtp(
          new RtpPacket(
            new RtpHeader({
              marker: false,
              payloadType: 111,
              sequenceNumber,
              timestamp,
              ssrc,
            }),
            SILENCE_OPUS_PACKET,
          ),
        );
        sequenceNumber = (sequenceNumber + 1) & 0xffff;
        timestamp = (timestamp + SILENCE_SAMPLES) >>> 0;
      }
      this.lastAudioSequenceNumber = sequenceNumber;
      this.lastAudioTimestamp = timestamp;
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      throw error;
    } finally {
      this.audioFinished = true;
    }
  }

  private async pumpVideo(
    videoTrack: MediaStreamTrack,
    videoStream: NodeJS.ReadableStream,
  ): Promise<void> {
    const reader = new H264AccessUnitReader(videoStream);
    const sender = new H264RtpSender(videoTrack, undefined, undefined, this.videoSsrc);
    let frameIndex = 0;
    let timelineStartedAt = performance.now();
    let keyframeFound = false;

    try {
      // 1. Wait until audio stream starts outputting media
      while (
        !this.abortController.signal.aborted &&
        this.audioTrack &&
        !this.audioStarted &&
        !this.audioFinished
      ) {
        await delay(5, undefined, { signal: this.abortController.signal });
      }

      while (!this.abortController.signal.aborted) {
        const frame = await reader.readFrame();
        if (!frame) break;

        // Ensure we always start emitting on a keyframe
        if (!keyframeFound) {
          if (!frame.isKeyframe) {
            continue; // Skip until the first keyframe (SPS/PPS/IDR)
          }
          keyframeFound = true;
          timelineStartedAt = performance.now();
        }

        if (this.audioTrack) {
          // Audio-driven clock (AV-sync): lock video frame release to audio sample progress
          // 1 video frame at 30fps corresponds to exactly VIDEO_FRAME_SAMPLES (1600) audio samples at 48kHz
          const targetAudioSamples = frameIndex * VIDEO_FRAME_SAMPLES;
          while (
            !this.abortController.signal.aborted &&
            !this.audioFinished &&
            this.audioMediaSamples < targetAudioSamples
          ) {
            const neededSamples = targetAudioSamples - this.audioMediaSamples;
            const waitMs = Math.max(
              1,
              Math.min(20, Math.ceil((neededSamples * 1000) / OPUS_CLOCK_RATE)),
            );
            await delay(waitMs, undefined, {
              signal: this.abortController.signal,
            });
          }
        } else {
          // Fallback wall-clock timer if publishing video-only
          const dueAt = timelineStartedAt + (frameIndex * 1000) / VIDEO_FPS;
          const waitMs = dueAt - performance.now();
          if (waitMs > 0) {
            await delay(waitMs, undefined, {
              signal: this.abortController.signal,
            });
          }
        }

        sender.sendFrame(frame.data, VIDEO_FRAME_DURATION_TIMESTAMP);
        frameIndex++;
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
