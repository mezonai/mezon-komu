import { MediaPreparer, StreamPipeline } from './media-preparer';
import { WhipMediaPublisher } from './whip-media-publisher';

export type WorkerCommand =
  | { type: 'prepare'; playUrl: string }
  | { type: 'publish'; whipUrl: string; token: string }
  | { type: 'stop' };

export type WorkerEvent =
  | { type: 'prepared'; hasVideo: boolean }
  | { type: 'started' }
  | { type: 'ended'; error?: string }
  | { type: 'stopped' }
  | { type: 'error'; action: 'prepare' | 'publish'; message: string };

let pipeline: StreamPipeline | undefined;
let publisher: WhipMediaPublisher | undefined;
let shuttingDown = false;

function emit(event: WorkerEvent): void {
  if (process.connected && typeof process.send === 'function') {
    process.send(event);
  }
}

async function cleanupResources(): Promise<void> {
  const activePublisher = publisher;
  const activePipeline = pipeline;
  publisher = undefined;
  pipeline = undefined;

  if (activePublisher) {
    try {
      await activePublisher.close();
    } catch {}
  }
  if (activePipeline) {
    try {
      await activePipeline.cleanup();
    } catch {}
  }
}

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await cleanupResources();
  emit({ type: 'stopped' });
  process.exit(exitCode);
}

process.on('message', async (msg: WorkerCommand) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'prepare') {
    if (shuttingDown) return;
    try {
      pipeline = await MediaPreparer.openPipeline(msg.playUrl);
      if (shuttingDown) {
        await pipeline.cleanup().catch(() => undefined);
        pipeline = undefined;
        return;
      }
      emit({ type: 'prepared', hasVideo: pipeline.hasVideo });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: 'error', action: 'prepare', message });
      await cleanupResources();
      process.exit(1);
    }
    return;
  }

  if (msg.type === 'publish') {
    if (shuttingDown) return;
    if (!pipeline) {
      emit({
        type: 'error',
        action: 'publish',
        message: 'Stream pipeline is not prepared',
      });
      return;
    }

    const activePipeline = pipeline;
    const activePublisher = new WhipMediaPublisher({
      whipUrl: msg.whipUrl,
      token: msg.token,
      audioStream: activePipeline.audioStream,
      videoStream: activePipeline.videoStream,
      onEnded: (error) => {
        if (publisher === activePublisher) {
          publisher = undefined;
        }
        if (pipeline === activePipeline) {
          pipeline = undefined;
        }
        void activePipeline.cleanup().finally(() => {
          if (!shuttingDown) {
            emit({
              type: 'ended',
              error: error ? error.message || String(error) : undefined,
            });
            process.exit(error ? 1 : 0);
          }
        });
      },
    });
    publisher = activePublisher;

    try {
      await activePublisher.start();
      if (!shuttingDown) {
        emit({ type: 'started' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: 'error', action: 'publish', message });
      await cleanupResources();
      process.exit(1);
    }
    return;
  }

  if (msg.type === 'stop') {
    await shutdown(0);
  }
});

process.on('disconnect', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Ncc8Worker] Uncaught exception:', err);
  void shutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Ncc8Worker] Unhandled rejection:', reason);
  void shutdown(1);
});

