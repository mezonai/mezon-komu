import { Readable } from 'stream';
import * as fs from 'fs';

export class GrowingFileStream extends Readable {
  private fd: number | null = null;
  private position = 0;
  private isStreamClosed = false;
  private reading = false;

  constructor(
    private readonly filePath: string,
    private readonly isWriterFinished: () => boolean,
    private readonly getWriterError: () => Error | null,
  ) {
    super({ highWaterMark: 64 * 1024 });
  }

  static open(
    filePath: string,
    isWriterFinished: () => boolean,
    getWriterError: () => Error | null,
  ): GrowingFileStream {
    return new GrowingFileStream(filePath, isWriterFinished, getWriterError);
  }

  override _read(size: number): void {
    if (this.reading || this.isStreamClosed) return;
    this.reading = true;
    void this.readLoop(size);
  }

  private async readLoop(size: number): Promise<void> {
    try {
      if (this.fd === null) {
        if (!fs.existsSync(this.filePath)) {
          if (this.isWriterFinished()) {
            this.reading = false;
            this.push(null);
            return;
          }
          setTimeout(() => {
            this.reading = false;
            this._read(size);
          }, 50);
          return;
        }
        this.fd = fs.openSync(this.filePath, 'r');
      }

      const buffer = Buffer.alloc(Math.max(size, 64 * 1024));
      while (!this.isStreamClosed) {
        let bytesRead = 0;
        try {
          bytesRead = fs.readSync(this.fd, buffer, 0, buffer.length, this.position);
        } catch (err: any) {
          if (this.isWriterFinished()) {
            const writerErr = this.getWriterError();
            if (writerErr) throw writerErr;
            this.reading = false;
            this.push(null);
            return;
          }
          throw err;
        }

        if (bytesRead > 0) {
          this.position += bytesRead;
          const chunk = Buffer.from(buffer.subarray(0, bytesRead));
          this.reading = false;
          this.push(chunk);
          return;
        }

        // bytesRead === 0
        if (this.isWriterFinished()) {
          const writerErr = this.getWriterError();
          if (writerErr) throw writerErr;
          this.reading = false;
          this.push(null);
          return;
        }

        await new Promise((r) => setTimeout(r, 40));
      }
    } catch (err: any) {
      this.destroy(err);
    } finally {
      this.reading = false;
    }
  }

  override _destroy(
    err: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    this.isStreamClosed = true;
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {}
      this.fd = null;
    }
    callback(err);
  }
}
