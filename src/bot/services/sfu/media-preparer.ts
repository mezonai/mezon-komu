import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { GrowingFileStream } from './growing-file-stream';

const logger = new Logger('MediaPreparer');

export interface StreamPipeline {
  audioStream: NodeJS.ReadableStream;
  videoStream?: NodeJS.ReadableStream;
  hasVideo: boolean;
  cleanup: () => Promise<void>;
}

interface MediaStreamInfo {
  hasAudio: boolean;
  audioCodec?: string;
  hasVideo: boolean;
  videoCodec?: string;
}

export function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const envVar =
    name === 'ffmpeg' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (envVar && fs.existsSync(envVar)) {
    return envVar;
  }
  if (process.platform === 'win32') {
    return `${name}.exe`;
  }
  const linuxPath = `/usr/bin/${name}`;
  if (fs.existsSync(linuxPath)) {
    return linuxPath;
  }
  return name;
}

export class MediaPreparer {
  private static tempDir = path.join(os.tmpdir(), 'komu_media_temp');

  static async openPipeline(urlOrPath: string): Promise<StreamPipeline> {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const cleanUrl = urlOrPath.split('?')[0];
    const urlHash = createHash('md5').update(cleanUrl).digest('hex');
    const oggFinalPath = path.join(this.tempDir, `${urlHash}.ogg`);
    const h264FinalPath = path.join(this.tempDir, `${urlHash}.h264`);

    // 1. Check if complete cached files already exist on disk
    if (fs.existsSync(oggFinalPath)) {
      const hasCachedVideo = fs.existsSync(h264FinalPath);
      logger.log(
        `Using cached media files for ${cleanUrl} (hasVideo=${hasCachedVideo}). Instant 0ms playback!`,
      );
      const audioStream = fs.createReadStream(oggFinalPath);
      const videoStream = hasCachedVideo
        ? fs.createReadStream(h264FinalPath)
        : undefined;

      return {
        audioStream,
        videoStream,
        hasVideo: hasCachedVideo,
        cleanup: async () => {
          audioStream.destroy();
          videoStream?.destroy();
        },
      };
    }

    // 2. Probe media codecs directly from source
    logger.log(`Probing media codecs from URL: ${cleanUrl}...`);
    const info = await this.probeMediaInfo(urlOrPath);
    logger.log(
      `Media probe result: audio=${info.audioCodec || 'none'} video=${info.videoCodec || 'none'}`,
    );

    // 3. Fast path: Audio-only Opus can stream directly from HTTP (0% CPU, 0ms latency)
    if (!info.hasVideo && info.audioCodec === 'opus' && /^https?:\/\//i.test(urlOrPath)) {
      logger.log(
        'Audio is already Opus (no video). Streaming directly via HTTP without transcoding.',
      );
      const res = await axios.get(urlOrPath, { responseType: 'stream' });
      const audioStream = res.data as NodeJS.ReadableStream;

      return {
        audioStream,
        videoStream: undefined,
        hasVideo: false,
        cleanup: async () => {
          (audioStream as any)?.destroy?.();
        },
      };
    }

    // 4. Real-time Growing File Pipeline (Mezube architecture: .part files on disk)
    const oggPartPath = `${oggFinalPath}.part`;
    const h264PartPath = `${h264FinalPath}.part`;

    // Clean up any stale partial files from prior runs
    try {
      if (fs.existsSync(oggPartPath)) fs.unlinkSync(oggPartPath);
      if (fs.existsSync(h264PartPath)) fs.unlinkSync(h264PartPath);
    } catch {}

    const ffmpegArgs: string[] = [
      '-y',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', urlOrPath,
      '-map', '0:a:0?',
      '-af', 'aresample=async=1:first_pts=0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      '-flush_packets', '1',
      '-f', 'ogg',
      oggPartPath,
    ];

    if (info.hasVideo) {
      ffmpegArgs.push(
        '-map', '0:v:0',
        '-vf', 'fps=30:start_time=0,scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2:out_color_matrix=bt709:out_range=tv,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
        '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709',
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-color_range', 'tv',
        '-c:v', 'libx264',
        '-preset', 'superfast',
        '-profile:v', 'baseline',
        '-level:v', '4.0',
        '-bf', '0',
        '-g', '60',
        '-keyint_min', '60',
        '-sc_threshold', '0',
        '-crf', '23',
        '-maxrate', '2500k',
        '-bufsize', '2500k',
        '-x264-params', 'repeat-headers=1',
        '-bsf:v', 'h264_metadata=aud=insert',
        '-flush_packets', '1',
        '-f', 'h264',
        h264PartPath,
      );
    }

    logger.log(`Launching background FFmpeg encode process...`);
    const ffmpegBin = resolveBinary('ffmpeg');
    const proc = spawn(ffmpegBin, ffmpegArgs);

    let isFinished = false;
    let procError: Error | null = null;
    let lastStderr = '';

    proc.stderr.on('data', (d) => {
      lastStderr = d.toString();
    });

    const writerPromise = new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        isFinished = true;
        if (code === 0) {
          logger.log(`FFmpeg encode completed successfully for ${cleanUrl}.`);
          try {
            if (fs.existsSync(oggPartPath)) {
              fs.renameSync(oggPartPath, oggFinalPath);
            }
            if (info.hasVideo && fs.existsSync(h264PartPath)) {
              fs.renameSync(h264PartPath, h264FinalPath);
            }
          } catch (renameErr) {
            logger.warn('Failed to rename completed part files to final cache:', renameErr);
          }
          resolve();
        } else if (!proc.killed) {
          procError = new Error(`FFmpeg exited with code ${code}: ${lastStderr.trim()}`);
          logger.warn(procError.message);
          reject(procError);
        } else {
          resolve();
        }
      });

      proc.on('error', (err) => {
        isFinished = true;
        procError = err;
        logger.error('FFmpeg process error:', err);
        reject(err);
      });
    });

    // Don't let unhandled rejections crash node if pipeline was already opened
    writerPromise.catch(() => {});

    // 5. Wait for initial header markers before starting playback (Mezube WaitUntilPlayable pattern)
    logger.log(`Buffering initial media chunks...`);
    await this.waitUntilPlayable(
      oggPartPath,
      info.hasVideo ? h264PartPath : null,
      () => isFinished,
      () => procError,
    );
    logger.log(`Initial buffer ready. Opening GrowingFileStream readers.`);

    const audioStream = GrowingFileStream.open(
      oggPartPath,
      () => isFinished,
      () => procError,
    );

    const videoStream = info.hasVideo
      ? GrowingFileStream.open(
          h264PartPath,
          () => isFinished,
          () => procError,
        )
      : undefined;

    return {
      audioStream,
      videoStream,
      hasVideo: info.hasVideo,
      cleanup: async () => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        audioStream.destroy();
        videoStream?.destroy();
        try {
          if (fs.existsSync(oggPartPath)) fs.unlinkSync(oggPartPath);
          if (info.hasVideo && fs.existsSync(h264PartPath)) fs.unlinkSync(h264PartPath);
        } catch {}
      },
    };
  }

  private static async waitUntilPlayable(
    oggPath: string,
    h264Path: string | null,
    isFinished: () => boolean,
    getError: () => Error | null,
    timeoutMs = 15000,
  ): Promise<void> {
    const start = Date.now();
    while (!isFinished()) {
      const err = getError();
      if (err) throw err;

      const oggOk = this.countMarkers(oggPath, Buffer.from('OggS')) >= 3;
      const h264Ok =
        !h264Path ||
        this.countMarkers(h264Path, Buffer.from([0, 0, 1, 9])) >= 2;

      if (oggOk && h264Ok) {
        return;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error('Media was not playable in time.');
      }

      await new Promise((r) => setTimeout(r, 60));
    }

    const finalErr = getError();
    if (finalErr) throw finalErr;
  }

  private static countMarkers(filePath: string, marker: Buffer): number {
    if (!fs.existsSync(filePath)) return 0;
    try {
      const fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      const readLen = Math.min(stat.size, 4 * 1024 * 1024);
      const buf = Buffer.alloc(readLen);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);

      let count = 0;
      let pos = 0;
      while (pos < bytesRead) {
        const idx = buf.indexOf(marker, pos);
        if (idx === -1) break;
        count++;
        pos = idx + marker.length;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private static probeMediaInfo(urlOrPath: string): Promise<MediaStreamInfo> {
    return new Promise((resolve) => {
      const ffprobeBin = resolveBinary('ffprobe');
      const proc = spawn(ffprobeBin, [
        '-v', 'error',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-show_entries', 'stream=codec_type,codec_name',
        '-of', 'json',
        urlOrPath,
      ]);
      let out = '';
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve({ hasAudio: true, hasVideo: false });
      }, 6000);

      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return resolve({ hasAudio: true, hasVideo: false });
        }
        try {
          const parsed = JSON.parse(out);
          const streams: Array<{ codec_type?: string; codec_name?: string }> =
            parsed.streams || [];
          const audio = streams.find((s) => s.codec_type === 'audio');
          const video = streams.find((s) => s.codec_type === 'video');

          resolve({
            hasAudio: !!audio,
            audioCodec: audio?.codec_name?.toLowerCase(),
            hasVideo: !!video,
            videoCodec: video?.codec_name?.toLowerCase(),
          });
        } catch {
          resolve({ hasAudio: true, hasVideo: false });
        }
      });
      proc.on('error', () => {
        clearTimeout(timer);
        resolve({ hasAudio: true, hasVideo: false });
      });
    });
  }
}
