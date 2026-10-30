import { Readable } from 'stream';

export interface H264Frame {
  data: Buffer;
  isKeyframe: boolean;
}

const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const KEYFRAME_NAL_TYPES = (1 << 5) | (1 << 7) | (1 << 8); // IDR (5), SPS (7), PPS (8)

const DELIMITER = Buffer.from([0, 0, 1, 9]);
const START_CODE = Buffer.from([0, 0, 1]);

export class H264AccessUnitReader {
  private buffer = Buffer.alloc(64 * 1024);
  private start = 0;
  private end = 0;
  private eof = false;
  private started = false;
  private readonly iterator: AsyncIterator<Buffer | Uint8Array>;

  constructor(source: NodeJS.ReadableStream) {
    this.iterator = (source as unknown as AsyncIterable<Buffer | Uint8Array>)[
      Symbol.asyncIterator
    ]();
  }

  async readFrame(): Promise<H264Frame | null> {
    if (!this.started) {
      while (this.end - this.start < 5 && !this.eof) {
        await this.readMore();
      }

      const head = this.buffer.subarray(this.start, this.end);
      if (head.subarray(0, 4).equals(DELIMITER)) {
        this.started = true;
      } else if (
        head.length > 0 &&
        head[0] === 0 &&
        head.subarray(1, 5).equals(DELIMITER)
      ) {
        this.start += 1;
        this.started = true;
      } else {
        throw new Error('H.264 stream does not start with an access unit delimiter [0, 0, 1, 9].');
      }
    }

    while (this.end > this.start) {
      let scanned = DELIMITER.length;
      let next = -1;

      while (true) {
        const hay = this.buffer.subarray(this.start + scanned, this.end);
        const found = hay.indexOf(DELIMITER);
        if (found >= 0) {
          next = this.start + scanned + found;
          break;
        }

        if (this.eof) {
          break;
        }

        if (this.end - this.start > MAX_FRAME_BYTES) {
          throw new Error('H.264 access unit is larger than 4 MiB.');
        }

        scanned = Math.max(scanned, this.end - this.start - (DELIMITER.length - 1));
        await this.readMore();
      }

      const stop = next >= 0 ? next : this.end;
      const unit = this.buffer.subarray(
        this.start + DELIMITER.length,
        stop,
      );
      this.start = stop;

      const first = unit.indexOf(START_CODE);
      if (first < 0) {
        continue;
      }

      let data = unit.subarray(first);
      // Trim trailing zeros
      let trimEnd = data.length;
      while (trimEnd > 0 && data[trimEnd - 1] === 0) {
        trimEnd--;
      }
      data = data.subarray(0, trimEnd);

      const isKey = hasNalTypes(data, KEYFRAME_NAL_TYPES);
      return {
        data: Buffer.from(data),
        isKeyframe: isKey,
      };
    }

    return null;
  }

  private async readMore(): Promise<void> {
    if (this.start > 0) {
      this.buffer.copy(this.buffer, 0, this.start, this.end);
      this.end -= this.start;
      this.start = 0;
    }

    if (this.end === this.buffer.length) {
      const newBuf = Buffer.alloc(this.buffer.length * 2);
      this.buffer.copy(newBuf, 0, 0, this.end);
      this.buffer = newBuf;
    }

    const next = await this.iterator.next();
    if (next.done) {
      this.eof = true;
    } else {
      const chunk = Buffer.from(next.value);
      if (this.end + chunk.length > this.buffer.length) {
        const newBuf = Buffer.alloc(
          Math.max(this.buffer.length * 2, this.end + chunk.length),
        );
        this.buffer.copy(newBuf, 0, 0, this.end);
        this.buffer = newBuf;
      }
      chunk.copy(this.buffer, this.end);
      this.end += chunk.length;
    }
  }
}

function hasNalTypes(accessUnit: Buffer, required: number): boolean {
  let types = 0;
  let rest = accessUnit;
  let at = rest.indexOf(START_CODE);

  while (at >= 0 && at + START_CODE.length < rest.length) {
    rest = rest.subarray(at + START_CODE.length);
    const nalType = rest[0] & 0x1f;
    types |= 1 << nalType;
    at = rest.indexOf(START_CODE);
  }

  return (types & required) === required;
}
