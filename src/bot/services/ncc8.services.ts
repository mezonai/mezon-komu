import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { MezonClientService } from '../../mezon/services/client.service';
import type { WorkerCommand, WorkerEvent } from './sfu/ncc8-publisher.worker';

@Injectable()
export class NCC8Service implements OnModuleDestroy {
  private readonly logger = new Logger(NCC8Service.name);
  private worker?: ChildProcess;
  private currentCleanUrl?: string;
  private operation: Promise<void> = Promise.resolve();

  constructor(private clientService: MezonClientService) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
  }

  onModuleDestroy(): Promise<void> {
    return this.stopCurrentPublisher();
  }

  playNcc8(fileUrl: string, originChannelId?: string): Promise<void> {
    return this.enqueue(async () => {
      const cleanUrl = fileUrl.split('?')[0];
      this.logger.log(`[NCC8Service] Starting playNcc8 for ${cleanUrl} (originChannelId: ${originChannelId})...`);

      const channelId = process.env.MEZON_NCC8_CHANNEL_ID;
      this.logger.log(`[NCC8Service] MEZON_NCC8_CHANNEL_ID: ${channelId}`);
      if (!channelId) {
        throw new Error('MEZON_NCC8_CHANNEL_ID is not configured.');
      }

      // If replaying the exact same source URL, stop first so cache/.part files don't collide
      if (this.currentCleanUrl === cleanUrl) {
        await this.stopCurrentPublisher();
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

      // Prepare new FFmpeg/stream pipeline in an isolated worker process while old track keeps playing
      this.logger.log(`[NCC8Service] Opening real-time stream in worker from URL ${cleanUrl}...`);
      const nextWorker = this.spawnWorker();
      let hasVideo = false;
      try {
        const prepared = await this.requestWorker(
          nextWorker,
          { type: 'prepare', playUrl },
          'prepared',
          'prepare',
        );
        hasVideo = prepared.hasVideo;
      } catch (prepErr) {
        await this.terminateWorker(nextWorker);
        throw prepErr;
      }

      try {
        await this.stopCurrentPublisher();
      } catch (stopErr) {
        await this.terminateWorker(nextWorker);
        throw stopErr;
      }

      this.logger.log(
        `[NCC8Service] Pipeline ready (hasVideo=${hasVideo}). Requesting WHIP grant for channel ${channelId}...`,
      );

      let response: any;
      try {
        response = await this.clientService.getClient().getStreamPlayback({
          channel_id: channelId,
          publish: true,
        });
      } catch (clientErr) {
        this.logger.error('[NCC8Service] client.getStreamPlayback failed:', clientErr);
        await this.terminateWorker(nextWorker);
        throw clientErr;
      }

      this.logger.log('[NCC8Service] getStreamPlayback response: ' + JSON.stringify(response));

      if (!response?.token || !response?.whip_url) {
        await this.terminateWorker(nextWorker);
        throw new Error(`Mezon did not return a valid WHIP endpoint or token. Response: ${JSON.stringify(response)}`);
      }

      this.worker = nextWorker;
      this.currentCleanUrl = cleanUrl;
      nextWorker.on('message', (event: WorkerEvent) => {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'ended') {
          if (this.worker === nextWorker) {
            this.worker = undefined;
            this.currentCleanUrl = undefined;
          }
          if (event.error) {
            this.logger.error(
              `[NCC8Service] NCC8 WHIP publisher stopped unexpectedly: ${event.error}`,
            );
          } else {
            this.logger.log('[NCC8Service] NCC8 WHIP stream finished.');
          }
        }
      });
      nextWorker.once('exit', () => {
        if (this.worker === nextWorker) {
          this.worker = undefined;
          this.currentCleanUrl = undefined;
        }
      });

      try {
        await this.requestWorker(
          nextWorker,
          { type: 'publish', whipUrl: response.whip_url, token: response.token },
          'started',
          'publish',
        );
        this.logger.log(
          `[NCC8Service] NCC8 is publishing live through Mezon WHIP (video=${hasVideo}).`,
        );
      } catch (error) {
        this.logger.error('[NCC8Service] worker publish failed:', error);
        if (this.worker === nextWorker) {
          this.worker = undefined;
          this.currentCleanUrl = undefined;
        }
        await this.terminateWorker(nextWorker);
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
    const activeWorker = this.worker;
    this.worker = undefined;
    this.currentCleanUrl = undefined;
    if (!activeWorker) return;

    await this.terminateWorker(activeWorker);
    // Brief pause after awaited WHIP DELETE while getStreamPlayback + ICE/SDP finishes setup
    await new Promise((r) => setTimeout(r, 200));
    this.logger.log('NCC8 WHIP publisher stopped.');
  }

  private spawnWorker(): ChildProcess {
    const isTs = __filename.endsWith('.ts');
    const workerPath = path.join(
      __dirname,
      'sfu',
      isTs ? 'ncc8-publisher.worker.ts' : 'ncc8-publisher.worker.js',
    );
    return fork(workerPath, [], {
      execArgv: isTs ? ['-r', 'ts-node/register'] : [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
  }

  private requestWorker<K extends 'prepared' | 'started'>(
    child: ChildProcess,
    command: WorkerCommand,
    expectedType: K,
    actionName: 'prepare' | 'publish',
  ): Promise<Extract<WorkerEvent, { type: K }>> {
    return new Promise((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null || !child.connected) {
        reject(new Error(`NCC8 worker is not running before ${actionName}`));
        return;
      }

      const cleanup = () => {
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
      };

      const onMessage = (event: WorkerEvent) => {
        if (!event || typeof event !== 'object') return;
        if (event.type === expectedType) {
          cleanup();
          resolve(event as Extract<WorkerEvent, { type: K }>);
        } else if (event.type === 'error' && event.action === actionName) {
          cleanup();
          reject(new Error(event.message));
        }
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(
          new Error(
            `NCC8 worker exited during ${actionName} (code=${code}, signal=${signal})`,
          ),
        );
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      child.on('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
      child.send(command);
    });
  }

  private async terminateWorker(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        child.off('exit', done);
        child.off('error', done);
        resolve();
      };

      const forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
        done();
      }, 6000);

      child.once('exit', done);
      child.once('error', done);

      if (child.connected) {
        try {
          child.send({ type: 'stop' } satisfies WorkerCommand);
        } catch {
          child.kill('SIGTERM');
        }
      } else {
        child.kill('SIGTERM');
      }
    });
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
