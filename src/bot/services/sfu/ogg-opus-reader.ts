import { Buffer } from 'buffer';

const MAX_PACKET_BYTES = 8 * 1024 * 1024;
const OPUS_HEAD = Buffer.from('OpusHead');
const OPUS_TAGS = Buffer.from('OpusTags');

class AsyncByteReader {
  private buffer = Buffer.alloc(0);
  private readonly iterator: AsyncIterator<Buffer | Uint8Array>;

  constructor(source: NodeJS.ReadableStream) {
    this.iterator = (source as unknown as AsyncIterable<Buffer | Uint8Array>)[
      Symbol.asyncIterator
    ]();
  }

  async readExactly(size: number, allowEof = false): Promise<Buffer | null> {
    while (this.buffer.length < size) {
      const next = await this.iterator.next();
      if (next.done) {
        if (allowEof && this.buffer.length === 0) return null;
        throw new Error('Truncated Ogg stream.');
      }

      const chunk = Buffer.from(next.value);
      this.buffer =
        this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    }

    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }
}

export async function* readOggOpusPackets(
  source: NodeJS.ReadableStream,
): AsyncGenerator<Buffer> {
  const reader = new AsyncByteReader(source);
  const pendingParts: Buffer[] = [];
  let pendingLength = 0;
  let serial: number | undefined;
  let previousSequence: number | undefined;
  let headSeen = false;
  let tagsSeen = false;

  while (true) {
    const header = await reader.readExactly(27, true);
    if (!header) break;

    if (
      header.subarray(0, 4).toString('ascii') !== 'OggS' ||
      header[4] !== 0 ||
      (header[5] & 0xf8) !== 0
    ) {
      throw new Error('Invalid Ogg page.');
    }

    const currentSerial = header.readUInt32LE(14);
    const sequence = header.readUInt32LE(18);
    if (serial === undefined) {
      serial = currentSerial;
    } else if (
      serial !== currentSerial ||
      sequence !== (previousSequence + 1) >>> 0
    ) {
      throw new Error('Ogg page serial or sequence is not continuous.');
    }
    previousSequence = sequence;

    const continued = (header[5] & 0x01) !== 0;
    if (continued !== pendingLength > 0) {
      throw new Error('Ogg continued-packet flag is inconsistent.');
    }

    const segmentTable = await reader.readExactly(header[26]);
    const bodyLength = segmentTable.reduce((sum, value) => sum + value, 0);
    const body = await reader.readExactly(bodyLength);
    if (!segmentTable || !body) {
      throw new Error('Truncated Ogg page.');
    }

    if (!hasValidOggCrc(header, segmentTable, body)) {
      throw new Error('Ogg page CRC validation failed.');
    }

    let offset = 0;
    for (const segmentSize of segmentTable) {
      const end = offset + segmentSize;
      pendingParts.push(body.subarray(offset, end));
      pendingLength += segmentSize;
      offset = end;

      if (pendingLength > MAX_PACKET_BYTES) {
        throw new Error('Ogg Opus packet exceeds the size limit.');
      }

      if (segmentSize === 255) continue;

      const packet = Buffer.concat(pendingParts, pendingLength);
      pendingParts.length = 0;
      pendingLength = 0;

      if (packet.subarray(0, OPUS_HEAD.length).equals(OPUS_HEAD)) {
        if (
          packet.length < 19 ||
          packet[8] !== 1 ||
          packet[9] !== 2 ||
          packet.readUInt32LE(12) !== 48000 ||
          packet[18] !== 0
        ) {
          throw new Error(
            'SFU audio must be Ogg Opus 48 kHz stereo with mapping family 0.',
          );
        }
        headSeen = true;
        continue;
      }

      if (packet.subarray(0, OPUS_TAGS.length).equals(OPUS_TAGS)) {
        if (!headSeen) {
          throw new Error('Ogg Opus tags appeared before the header.');
        }
        tagsSeen = true;
        continue;
      }

      if (!headSeen || !tagsSeen || packet.length === 0) {
        throw new Error('Ogg stream does not contain a valid Opus payload.');
      }

      yield packet;
    }
  }

  if (pendingLength !== 0) {
    throw new Error('Truncated Ogg Opus packet.');
  }
  if (!headSeen || !tagsSeen) {
    throw new Error('Ogg stream ended before Opus headers.');
  }
}

export function getOpusDurationSamples(packet: Buffer): number {
  if (packet.length === 0) {
    throw new Error('Empty Opus packet.');
  }

  const config = packet[0] >> 3;
  const frameCode = packet[0] & 0x03;
  const durationMs =
    config < 12 ? [10, 20, 40, 60][config & 3] : 2.5 * (1 << (config & 3));

  let frameCount: number;
  if (frameCode === 0) {
    frameCount = 1;
  } else if (frameCode === 1 || frameCode === 2) {
    frameCount = 2;
  } else if (packet.length >= 2 && (packet[1] & 0x3f) !== 0) {
    frameCount = packet[1] & 0x3f;
  } else {
    throw new Error('Invalid Opus packet frame count.');
  }

  const samples = durationMs * 48 * frameCount;
  if (!Number.isInteger(samples) || samples <= 0 || samples > 5760) {
    throw new Error('Opus packet duration is outside the supported range.');
  }

  return samples;
}

function hasValidOggCrc(
  header: Buffer,
  segmentTable: Buffer,
  body: Buffer,
): boolean {
  const expected = header.readUInt32LE(22);
  const headerCopy = Buffer.from(header);
  headerCopy.fill(0, 22, 26);

  let crc = updateOggCrc(0, headerCopy);
  crc = updateOggCrc(crc, segmentTable);
  crc = updateOggCrc(crc, body);
  return crc === expected;
}

function updateOggCrc(initialCrc: number, data: Buffer): number {
  let crc = initialCrc >>> 0;
  for (const value of data) {
    crc = (crc ^ (value << 24)) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x80000000) !== 0
          ? ((crc << 1) ^ 0x04c11db7) >>> 0
          : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}
