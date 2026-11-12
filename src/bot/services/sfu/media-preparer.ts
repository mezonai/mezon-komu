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
    logger.log(`[resolveBinary] Found ${name} via ENV: ${envVar}`);
    return envVar;
  }
  if (process.platform === 'win32') {
    return `${name}.exe`;
  }
  // Prioritize system package (/usr/bin) over static binary because static musl/GnuTLS builds
  // (like johnvansickle static builds) can segfault (SIGSEGV 139) on HTTPS network requests on Linux.
  const linuxPath = `/usr/bin/${name}`;
  if (fs.existsSync(linuxPath)) {
    logger.log(`[resolveBinary] Found ${name} via system path: ${linuxPath}`);
    return linuxPath;
  }
  // Fallback to static binaries from node_modules if system binary is missing
  try {
    if (name === 'ffmpeg') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        logger.log(`[resolveBinary] Found ffmpeg via ffmpeg-static fallback: ${ffmpegStatic}`);
        return ffmpegStatic;
      }
    } else if (name === 'ffprobe') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic?.path && fs.existsSync(ffprobeStatic.path)) {
        logger.log(`[resolveBinary] Found ffprobe via ffprobe-static fallback: ${ffprobeStatic.path}`);
        return ffprobeStatic.path;
      }
    }
  } catch (err) {
    logger.warn(`[resolveBinary] Error finding static fallback for ${name}:`, err);
  }
  logger.warn(`[resolveBinary] Could not find ${name} at /usr/bin/${name} or static packages. Falling back to '${name}'.`);
  return name;
}

export class MediaPreparer {
  private static tempDir = path.join(os.tmpdir(), 'komu_media_temp');

  static async openPipeline(urlOrPath: string): Promise<StreamPipeline> {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const cleanUrl = urlOrPath.split('?')[0];
    const urlHash = createHash('md5').update(`v2:${cleanUrl}`).digest('hex');
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

    const ffmpegArgs: string[] = ['-y'];
    if (/^https?:\/\//i.test(urlOrPath)) {
      ffmpegArgs.push(
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
      );
    }
    ffmpegArgs.push(
      '-i', urlOrPath,
      '-map', '0:a:0?',
      '-af', 'aresample=async=1:first_pts=0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      '-page_duration', '40000',
      '-flush_packets', '1',
      '-f', 'ogg',
      oggPartPath,
    );

    if (info.hasVideo) {
      ffmpegArgs.push(
        '-map', '0:v:0',
        '-vf', 'fps=30:start_time=0,scale=1280:720:force_original_aspect_ratio=decrease:out_color_matrix=bt709:out_range=tv,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
        '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709',
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-color_range', 'tv',
        '-c:v', 'libx264',
        '-preset', 'superfast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-level:v', '4.0',
        '-bf', '0',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
        '-b:v', '1200k',
        '-maxrate', '1400k',
        '-bufsize', '700k',
        '-x264-params', 'repeat-headers=1',
        '-bsf:v', 'h264_metadata=aud=insert',
        '-flush_packets', '1',
        '-f', 'h264',
        h264PartPath,
      );
    }

    logger.log(`Launching background FFmpeg encode process...`);
    const ffmpegBin = resolveBinary('ffmpeg');
    logger.log(`[MediaPreparer] Using ffmpeg binary: ${ffmpegBin}`);
    const proc = spawn(ffmpegBin, ffmpegArgs);

    let isFinished = false;
    let procError: Error | null = null;
    let lastStderr = '';

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      lastStderr = (lastStderr + chunk).slice(-2000);
    });

    const writerPromise = new Promise<void>((resolve, reject) => {
      proc.on('close', (code, signal) => {
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
          procError = new Error(`FFmpeg exited with code ${code ?? signal}: ${lastStderr.trim()}`);
          logger.error(`[MediaPreparer] ${procError.message}`);
          reject(procError);
        } else {
          logger.log('[MediaPreparer] FFmpeg process killed.');
          resolve();
        }
      });

      proc.on('error', (err) => {
        isFinished = true;
        procError = err;
        logger.error('[MediaPreparer] FFmpeg process spawn/runtime error:', err);
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
    timeoutMs = 25000,
  ): Promise<void> {
    const start = Date.now();
    let lastLogTime = 0;
    while (!isFinished()) {
      const err = getError();
      if (err) {
        logger.error('[MediaPreparer] waitUntilPlayable error:', err);
        throw err;
      }

      const oggMarkers = this.countMarkers(oggPath, Buffer.from('OggS'));
      const h264Markers = h264Path
        ? this.countMarkers(h264Path, Buffer.from([0, 0, 1, 9]))
        : 0;

      // In Ogg Opus, Page 1 is OpusHead, Page 2 is OpusTags, and audio data starts from Page 3.
      // With -page_duration 40000, pages are written in fine 40ms grains (~2 packets per page).
      // We ensure at least 25 pages (~1s) or 32KB of audio data before starting.
      const oggOk =
        oggMarkers >= 25 ||
        (fs.existsSync(oggPath) && fs.statSync(oggPath).size >= 32 * 1024);
      // For H264: 45 markers = 45 AUD frames (~1.5s of 30fps video for safety buffer)
      const h264Ok = !h264Path || h264Markers >= 45;

      if (oggOk && h264Ok) {
        logger.log(
          `[MediaPreparer] Playable buffer ready in ${Date.now() - start}ms (oggMarkers=${oggMarkers}, h264Markers=${h264Markers})`,
        );
        return;
      }

      const now = Date.now();
      if (now - lastLogTime > 2000) {
        lastLogTime = now;
        const oggSize = fs.existsSync(oggPath) ? fs.statSync(oggPath).size : 0;
        logger.log(
          `[MediaPreparer] Buffering... elapsed=${now - start}ms, oggMarkers=${oggMarkers} (size=${oggSize}B), h264Markers=${h264Markers}${h264Path ? '/45' : ''}`,
        );
      }

      if (Date.now() - start > timeoutMs) {
        const oggSize = fs.existsSync(oggPath) ? fs.statSync(oggPath).size : 0;
        const timeoutErr = new Error(
          `Media was not playable in time (${timeoutMs}ms). OGG size: ${oggSize}B (markers: ${oggMarkers}), H264 markers: ${h264Markers}`,
        );
        logger.error(`[MediaPreparer] ${timeoutErr.message}`);
        throw timeoutErr;
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
      const readLen = Math.min(stat.size, 8 * 1024 * 1024);
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
      logger.log(`[MediaPreparer] Probing codecs with ffprobe (${ffprobeBin})...`);
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
      let errOut = '';
      const timer = setTimeout(() => {
        logger.warn('[MediaPreparer] ffprobe timed out after 6000ms. Fallback to audio-only.');
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve({ hasAudio: true, hasVideo: false });
      }, 6000);

      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.stderr.on('data', (d) => (errOut += d.toString()));
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          logger.warn(`[MediaPreparer] ffprobe exited with code ${code}. Stderr: ${errOut.trim()}`);
          return resolve({ hasAudio: true, hasVideo: false });
        }
        try {
          const parsed = JSON.parse(out);
          const streams: Array<{ codec_type?: string; codec_name?: string }> =
            parsed.streams || [];
          const audio = streams.find((s) => s.codec_type === 'audio');
          const video = streams.find((s) => s.codec_type === 'video');

          logger.log(`[MediaPreparer] Probe success: audio=${audio?.codec_name || 'none'}, video=${video?.codec_name || 'none'}`);
          resolve({
            hasAudio: !!audio,
            audioCodec: audio?.codec_name?.toLowerCase(),
            hasVideo: !!video,
            videoCodec: video?.codec_name?.toLowerCase(),
          });
        } catch (jsonErr) {
          logger.warn(`[MediaPreparer] Could not parse ffprobe output: ${jsonErr}`);
          resolve({ hasAudio: true, hasVideo: false });
        }
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        logger.error('[MediaPreparer] ffprobe process spawn error:', err);
        resolve({ hasAudio: true, hasVideo: false });
      });
    });
  }
}
