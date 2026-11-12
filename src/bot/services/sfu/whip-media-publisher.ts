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
const MAX_CATCH_UP_MS = 80;
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
  private audioSender?: any;
  private videoRtpSender?: any;
  private audioSsrc?: number;
  private videoSsrc?: number;
  private resourceUrl?: string;
  private lastAudioSequenceNumber?: number;
  private lastAudioTimestamp?: number;
  private readonly abortController = new AbortController();
  private stopping = false;
  private finished = false;
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
      console.log(`[WhipMediaPublisher] Starting WHIP publication. URL: ${this.options.whipUrl}, hasVideo: ${hasVideo}`);

      // 1. Setup RTCPeerConnection with Opus and H.264 codecs
      const pc = new RTCPeerConnection({
        codecs: {
          audio: [
            new RTCRtpCodecParameters({
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
              payloadType: 111,
              parameters: 'minptime=10;useinbandfec=1',
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

      pc.connectionStateChange.subscribe((state) => {
        console.log(`[WhipMediaPublisher] pc.connectionStateChange -> ${state}`);
      });
      pc.iceConnectionStateChange.subscribe((state) => {
        console.log(`[WhipMediaPublisher] pc.iceConnectionStateChange -> ${state}`);
      });
      pc.iceGatheringStateChange.subscribe((state) => {
        console.log(`[WhipMediaPublisher] pc.iceGatheringStateChange -> ${state}`);
      });
      pc.onIceCandidate.subscribe((candidate) => {
        if (candidate?.candidate) {
          console.log(`[WhipMediaPublisher] Gathered local ICE candidate: ${candidate.candidate.trim()}`);
        }
      });

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

      this.audioSender = audioTransceiver.sender;
      this.audioSsrc = audioTransceiver.sender.ssrc;
      if (videoTransceiver) {
        this.videoRtpSender = videoTransceiver.sender;
        this.videoSsrc = videoTransceiver.sender.ssrc;
      }

      // 2. Create Offer & gather ICE candidates
      console.log('[WhipMediaPublisher] Creating local SDP offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('[WhipMediaPublisher] Gathering ICE candidates...');
      await this.waitForIceGatheringComplete(pc, 2000);
      const offerSdp = pc.localDescription?.sdp || offer.sdp;

      // 3. POST SDP Offer to WHIP endpoint
      console.log(`[WhipMediaPublisher] Sending SDP offer to WHIP endpoint: ${this.options.whipUrl}...`);
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
      console.log('[WhipMediaPublisher] WHIP POST status:', whipRes.status, 'Location:', locHeader);
      if (locHeader) {
        this.resourceUrl = new URL(locHeader, this.options.whipUrl).toString();
        console.log('[WhipMediaPublisher] WHIP resourceUrl for teardown:', this.resourceUrl);
      } else {
        console.warn('[WhipMediaPublisher] WHIP server returned NO Location header!');
      }

      const answerSdp = whipRes.data;
      if (!answerSdp || typeof answerSdp !== 'string') {
        throw new Error('WHIP server returned empty SDP answer.');
      }

      // 4. Set Remote SDP Answer
      console.log('[WhipMediaPublisher] Setting remote SDP answer...');
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      // 5. Wait for WebRTC handshake
      console.log(`[WhipMediaPublisher] Waiting up to ${CONNECT_TIMEOUT_MS}ms for WebRTC handshake...`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const timeoutErr = new Error(
            `Timed out after ${CONNECT_TIMEOUT_MS}ms waiting for WHIP WebRTC peer connection. State: connectionState=${pc.connectionState}, iceConnectionState=${pc.iceConnectionState}`,
          );
          console.error(`[WhipMediaPublisher] ${timeoutErr.message}`);
          reject(timeoutErr);
        }, CONNECT_TIMEOUT_MS);

        pc.connectionStateChange.subscribe((state) => {
          if (state === 'connected') {
            clearTimeout(timer);
            resolve();
          } else if (state === 'failed' || state === 'closed') {
            clearTimeout(timer);
            if (!this.stopping) {
              const err = new Error(`WHIP WebRTC connection ${state}. (iceState=${pc.iceConnectionState})`);
              console.error(`[WhipMediaPublisher] Handshake aborted: ${err.message}`);
              reject(err);
              void this.finish(err);
            }
          }
        });
      });

      console.log('[WhipMediaPublisher] WebRTC handshake connected successfully! Pumping media...');
      // 6. Pump media streams
      void this.pumpMedia()
        .then(() => this.finish())
        .catch((error) => this.finish(asError(error)));
    } catch (error) {
      console.error('[WhipMediaPublisher] start() failed:', error);
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.abortController.abort();

    // 0. If no WHIP resourceUrl exists to DELETE cleanly, send brief silence to avoid looping last frame
    if (
      !this.resourceUrl &&
      this.audioTrack &&
      this.audioSsrc !== undefined &&
      this.lastAudioSequenceNumber !== undefined &&
      this.lastAudioTimestamp !== undefined
    ) {
      try {
        let seq = (this.lastAudioSequenceNumber + 1) & 0xffff;
        let ts = (this.lastAudioTimestamp + SILENCE_SAMPLES) >>> 0;
        for (let i = 0; i < 10; i++) {
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
    if (this.audioTrack) {
      await this.pumpAudioAndVideo();
    } else if (this.videoTrack && this.options.videoStream) {
      await this.pumpVideoOnly(this.videoTrack, this.options.videoStream);
    }
  }

  private async pumpAudioAndVideo(): Promise<void> {
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

    const videoReader =
      this.videoTrack && this.options.videoStream
        ? new H264AccessUnitReader(this.options.videoStream)
        : null;
    const videoSender =
      this.videoTrack && this.options.videoStream
        ? new H264RtpSender(this.videoTrack, undefined, undefined, this.videoSsrc)
        : null;
    let videoTime = 0;
    let keyframeFound = false;

    let packetCount = 0;
    let underflows = 0;
    let lagSkips = 0;
    let maxLagMs = 0;
    let lastProgressLog = Date.now();

    // Decoupled in-memory producer queues (Mezube high-performance architecture)
    // Reading from disk is done asynchronously in the background so that
    // the real-time RTP sending loop is NEVER blocked by disk I/O.
    interface QueuedAudio {
      payload: Buffer;
      duration: number;
    }
    const audioQueue: QueuedAudio[] = [];
    let audioProducerDone = false;
    let audioProducerError: any = null;

    const runAudioProducer = async () => {
      try {
        for await (const payload of readOggOpusPackets(this.options.audioStream)) {
          if (this.abortController.signal.aborted) break;
          const duration = getOpusDurationSamples(payload);
          audioQueue.push({ payload, duration });
          while (audioQueue.length >= 300 && !this.abortController.signal.aborted) {
            await delay(15, undefined, { signal: this.abortController.signal });
          }
        }
      } catch (err) {
        if (!this.abortController.signal.aborted) {
          audioProducerError = err;
        }
      } finally {
        audioProducerDone = true;
      }
    };

    interface QueuedVideo {
      data: Buffer;
      isKeyframe: boolean;
    }
    const videoQueue: QueuedVideo[] = [];
    let videoProducerDone = false;
    let videoProducerError: any = null;

    const runVideoProducer = async () => {
      if (!videoReader) {
        videoProducerDone = true;
        return;
      }
      try {
        while (!this.abortController.signal.aborted) {
          const frame = await videoReader.readFrame();
          if (!frame) break;
          videoQueue.push(frame);
          while (videoQueue.length >= 180 && !this.abortController.signal.aborted) {
            await delay(15, undefined, { signal: this.abortController.signal });
          }
        }
      } catch (err) {
        if (!this.abortController.signal.aborted) {
          videoProducerError = err;
        }
      } finally {
        videoProducerDone = true;
      }
    };

    const audioWorker = runAudioProducer();
    const videoWorker = runVideoProducer();

    console.log('[WhipMediaPublisher] Pre-buffering in-memory audio/video queue...');
    // Pre-fill memory queue with audio (~1s) and video (~1s) before starting RTP send loop
    while (
      !this.abortController.signal.aborted &&
      ((!audioProducerDone && audioQueue.length < 50) ||
        (videoSender && !videoProducerDone && videoQueue.length < 30))
    ) {
      await delay(10, undefined, { signal: this.abortController.signal });
    }

    console.log(
      `[WhipMediaPublisher] Starting decoupled real-time send loop (queue=${audioQueue.length}, videoQueue=${videoQueue.length})...`,
    );
    timelineStartedAt = performance.now();
    sentSamples = 0;
    this.audioStarted = true;

    try {
      while (!this.abortController.signal.aborted) {
        if (audioQueue.length === 0 && audioProducerDone) {
          if (audioProducerError) throw audioProducerError;
          break; // Normal stream EOF
        }

        let item = audioQueue.shift();
        if (!item) {
          // Underflow protection (Mezube pattern):
          // If disk read or FFmpeg had a momentary stutter, emit silence to keep WebRTC clock moving!
          underflows++;
          item = { payload: SILENCE_OPUS_PACKET, duration: SILENCE_SAMPLES };
        }

        packetCount++;
        const dueAt =
          timelineStartedAt + (sentSamples * 1000) / OPUS_CLOCK_RATE;
        const now = performance.now();
        const waitMs = dueAt - now;
        if (waitMs > 2) {
          await delay(waitMs - 1, undefined, {
            signal: this.abortController.signal,
          });
        }
        const spinRemaining = dueAt - performance.now();
        if (spinRemaining > 0 && spinRemaining < 2) {
          while (performance.now() < dueAt) {
            // sub-millisecond precision
          }
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
            item.payload,
          ),
        );

        firstPacket = false;
        sequenceNumber = (sequenceNumber + 1) & 0xffff;
        timestamp = (timestamp + item.duration) >>> 0;
        sentSamples += item.duration;
        this.lastAudioSequenceNumber = sequenceNumber;
        this.lastAudioTimestamp = timestamp;

        const expectedNow =
          timelineStartedAt + (sentSamples * 1000) / OPUS_CLOCK_RATE;
        const lag = performance.now() - expectedNow;
        if (lag > maxLagMs) {
          maxLagMs = lag;
        }
        if (lag > MAX_CATCH_UP_MS) {
          const skipSamples =
            Math.floor((lag * OPUS_CLOCK_RATE) / 1000 / SILENCE_SAMPLES) *
            SILENCE_SAMPLES;
          if (skipSamples > 0) {
            timestamp = (timestamp + skipSamples) >>> 0;
            sentSamples += skipSamples;
            lagSkips++;
          }
        }

        // Video sync: audio timeline drives video frame release from RAM queue
        if (videoSender && videoQueue.length > 0) {
          const audioTime =
            (sentSamples * VIDEO_CLOCK_RATE) / OPUS_CLOCK_RATE;
          let framesSentThisTick = 0;
          while (
            videoTime < audioTime &&
            videoQueue.length > 0 &&
            framesSentThisTick < 2 &&
            !this.abortController.signal.aborted
          ) {
            const frame = videoQueue.shift()!;
            if (!keyframeFound) {
              if (!frame.isKeyframe) continue;
              keyframeFound = true;
            }

            videoSender.sendFrame(frame.data, VIDEO_FRAME_DURATION_TIMESTAMP);
            videoTime += VIDEO_FRAME_DURATION_TIMESTAMP;
            framesSentThisTick++;
          }
        }

        if (Date.now() - lastProgressLog > 10000) {
          lastProgressLog = Date.now();
          const streamedSec = (sentSamples / OPUS_CLOCK_RATE).toFixed(1);
          const audioNacks = this.audioSender?.nackCount ?? 0;
          const videoNacks = this.videoRtpSender?.nackCount ?? 0;
          const videoPlis = this.videoRtpSender?.pliCount ?? 0;
          console.log(
            `[WhipMediaPublisher] Streamed: ${streamedSec}s (${packetCount} audio pkts, q=${audioQueue.length}, vq=${videoQueue.length}, underflow=${underflows}, lagSkip=${lagSkips}, maxLag=${maxLagMs.toFixed(1)}ms, nack=${audioNacks}/${videoNacks}, pli=${videoPlis})`,
          );
        }
      }

      console.log(`[WhipMediaPublisher] Reached media EOF (${packetCount} packets sent). Flushing silence...`);
      // 3. Flush trailing silence when track reaches normal EOF
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
      if (this.abortController.signal.aborted) {
        console.log('[WhipMediaPublisher] pumpAudioAndVideo aborted cleanly.');
        return;
      }
      console.error('[WhipMediaPublisher] pumpAudioAndVideo encountered error:', error);
      throw error;
    } finally {
      this.audioFinished = true;
      try {
        await Promise.allSettled([audioWorker, videoWorker]);
      } catch {}
    }
  }

  private async pumpVideoOnly(
    videoTrack: MediaStreamTrack,
    videoStream: NodeJS.ReadableStream,
  ): Promise<void> {
    const reader = new H264AccessUnitReader(videoStream);
    const sender = new H264RtpSender(videoTrack, undefined, undefined, this.videoSsrc);
    let frameIndex = 0;
    const timelineStartedAt = performance.now();
    let keyframeFound = false;

    try {
      while (!this.abortController.signal.aborted) {
        const frame = await reader.readFrame();
        if (!frame) break;

        if (!keyframeFound) {
          if (!frame.isKeyframe) continue;
          keyframeFound = true;
        }

        const dueAt = timelineStartedAt + (frameIndex * 1000) / VIDEO_FPS;
        const waitMs = dueAt - performance.now();
        if (waitMs > 0) {
          await delay(waitMs, undefined, {
            signal: this.abortController.signal,
          });
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
