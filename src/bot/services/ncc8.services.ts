import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { MezonClientService } from '../../mezon/services/client.service';
import { WhipMediaPublisher } from './sfu/whip-media-publisher';
import { MediaPreparer, StreamPipeline } from './sfu/media-preparer';

@Injectable()
export class NCC8Service {
  private readonly logger = new Logger(NCC8Service.name);
  private publisher?: WhipMediaPublisher;
  private currentPipeline?: StreamPipeline;
  private operation: Promise<void> = Promise.resolve();

  constructor(private clientService: MezonClientService) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
  }

  playNcc8(fileUrl: string, originChannelId?: string): Promise<void> {
    return this.enqueue(async () => {
      const cleanUrl = fileUrl.split('?')[0];
      this.logger.log(`[NCC8Service] Starting playNcc8 for ${cleanUrl} (originChannelId: ${originChannelId})...`);
      await this.stopCurrentPublisher();

      const channelId = process.env.MEZON_NCC8_CHANNEL_ID;
      this.logger.log(`[NCC8Service] MEZON_NCC8_CHANNEL_ID: ${channelId}`);
      if (!channelId) {
        throw new Error('MEZON_NCC8_CHANNEL_ID is not configured.');
      }

      let playUrl = fileUrl;
      if (cleanUrl.includes('cdn.mezon.')) {
        let fileChannelId = originChannelId;
        if (!fileChannelId) {
          try {
            const parts = new URL(cleanUrl).pathname.split('/').filter(Boolean);
            if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
              fileChannelId = parts[1];
            }
          } catch {}
        }
        if (!fileChannelId) {
          fileChannelId = channelId;
        }

        try {
          const cdnSig = await this.clientService.getClient().generateCDNSignature({
            channel_id: fileChannelId,
          });
          if (cdnSig?.signature) {
            const sig = cdnSig.signature.startsWith('?')
              ? cdnSig.signature.slice(1)
              : cdnSig.signature;
            playUrl = `${cleanUrl}?${sig}`;
            this.logger.log(`[NCC8Service] Generated fresh CDN signature for fileChannelId ${fileChannelId}`);
          }
        } catch (sigErr) {
          this.logger.error('[NCC8Service] Failed to generate CDN signature for NCC8 playback:', sigErr);
        }
      }

      this.logger.log(`[NCC8Service] Opening real-time stream from URL ${cleanUrl}...`);
      const pipeline = await MediaPreparer.openPipeline(playUrl);
      this.currentPipeline = pipeline;

      this.logger.log(
        `[NCC8Service] Pipeline ready (hasVideo=${pipeline.hasVideo}). Requesting WHIP grant for channel ${channelId}...`,
      );

      let response: any;
      try {
        response = await this.clientService.getClient().getStreamPlayback({
          channel_id: channelId,
          publish: true,
        });
      } catch (clientErr) {
        this.logger.error('[NCC8Service] client.getStreamPlayback failed:', clientErr);
        await pipeline.cleanup();
        throw clientErr;
      }

      this.logger.log('[NCC8Service] getStreamPlayback response: ' + JSON.stringify(response));

      if (!response?.token || !response?.whip_url) {
        await pipeline.cleanup();
        throw new Error(`Mezon did not return a valid WHIP endpoint or token. Response: ${JSON.stringify(response)}`);
      }

      const publisher = new WhipMediaPublisher({
        whipUrl: response.whip_url,
        token: response.token,
        audioStream: pipeline.audioStream,
        videoStream: pipeline.videoStream,
        onEnded: (error) => {
          if (this.publisher === publisher) {
            this.publisher = undefined;
          }
          void pipeline.cleanup();
          if (error) {
            this.logger.error(
              '[NCC8Service] NCC8 WHIP publisher stopped unexpectedly:',
              error,
            );
          } else {
            this.logger.log('[NCC8Service] NCC8 WHIP stream finished.');
          }
        },
      });

      this.publisher = publisher;
      try {
        await publisher.start();
        this.logger.log(
          `[NCC8Service] NCC8 is publishing live through Mezon WHIP (video=${pipeline.hasVideo}).`,
        );
      } catch (error) {
        this.logger.error('[NCC8Service] publisher.start() failed:', error);
        if (this.publisher === publisher) {
          this.publisher = undefined;
        }
        void pipeline.cleanup();
        throw error;
      }
    });
  }

  stopNcc8(): Promise<void> {
    return this.enqueue(() => this.stopCurrentPublisher());
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.operation.then(action, action);
    this.operation = next.catch(() => undefined);
    return next;
  }

  private async stopCurrentPublisher(): Promise<void> {
    const publisher = this.publisher;
    this.publisher = undefined;
    if (this.currentPipeline) {
      await this.currentPipeline.cleanup();
      this.currentPipeline = undefined;
    }
    if (!publisher) return;

    await publisher.close();
    // Allow mezon-streaming-server to teardown edge session and clear HLS/WebRTC jitter buffer
    await new Promise((r) => setTimeout(r, 600));
    this.logger.log('NCC8 WHIP publisher stopped.');
  }

  async convertMp3ToOgg(mp3Path: string): Promise<string> {
    const outputPath = mp3Path.replace(/\.mp3$/, '.ogg');

    return new Promise((resolve, reject) => {
      ffmpeg(mp3Path)
        .toFormat('ogg')
        .on('end', () => {
          console.log('Conversion finished:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Error during conversion:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }
}
