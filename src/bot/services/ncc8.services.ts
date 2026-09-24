import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { MezonClientService } from 'src/mezon/services/client.service';
import { SfuAudioPublisher } from './sfu/sfu-audio-publisher';

@Injectable()
export class NCC8Service {
  private readonly logger = new Logger(NCC8Service.name);
  private publisher?: SfuAudioPublisher;
  private operation: Promise<void> = Promise.resolve();

  constructor(private clientService: MezonClientService) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
  }

  playNcc8(fileUrl: string): Promise<void> {
    return this.enqueue(async () => {
      await this.stopCurrentPublisher();

      const channelId = process.env.MEZON_NCC8_CHANNEL_ID;
      if (!channelId) {
        throw new Error('MEZON_NCC8_CHANNEL_ID is not configured.');
      }

      const response = await this.clientService.getClient().generateMeetToken({
        channel_id: channelId,
        room_name: '',
        metadata: '',
      });
      console.log('response', response)
      if (!response?.token) {
        throw new Error('Mezon returned an empty SFU meet token.');
      }

      const publisher = new SfuAudioPublisher({
        signalingUrl: process.env.MEZON_SFU_URL || 'wss://sfu.mezon.vn/ws',
        roomId: channelId,
        token: response.token,
        mediaUrl: fileUrl,
        onEnded: (error) => {
          if (this.publisher === publisher) {
            this.publisher = undefined;
          }
          if (error) {
            this.logger.error(
              'NCC8 SFU publisher stopped unexpectedly.',
              error,
            );
          } else {
            this.logger.log('NCC8 SFU stream finished.');
          }
        },
      });

      this.publisher = publisher;
      try {
        await publisher.start();
        this.logger.log('NCC8 is publishing audio through Mezon SFU.');
      } catch (error) {
        if (this.publisher === publisher) {
          this.publisher = undefined;
        }
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
    if (!publisher) return;

    await publisher.close();
    this.logger.log('NCC8 SFU publisher stopped.');
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
