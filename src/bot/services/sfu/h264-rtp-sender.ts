import { MediaStreamTrack, RtpHeader, RtpPacket } from 'werift';

export const MAX_RTP_PAYLOAD = 1200;
const START_CODE_3 = Buffer.from([0, 0, 1]);
const START_CODE_4 = Buffer.from([0, 0, 0, 1]);

interface NalUnit {
  nal: Buffer;
  isLast: boolean;
}

export class H264RtpSender {
  private sequence: number;
  private timestamp: number;
  private readonly ssrc: number;

  constructor(
    private readonly videoTrack: MediaStreamTrack,
    firstSequence?: number,
    firstTimestamp?: number,
    ssrc?: number,
  ) {
    this.sequence = firstSequence ?? Math.floor(Math.random() * 0xffff);
    this.timestamp = firstTimestamp ?? Math.floor(Math.random() * 0xffffffff);
    this.ssrc = ssrc ?? Math.floor(Math.random() * 0xffffffff);
  }

  sendFrame(accessUnit: Buffer, durationSamples: number = 3000): void {
    const nals = parseNals(accessUnit);
    if (nals.length === 0) return;

    for (const { nal, isLast } of nals) {
      if (nal.length <= MAX_RTP_PAYLOAD) {
        // Single NAL unit packet
        this.sendPacket(nal, isLast ? 1 : 0);
        continue;
      }

      // FU-A Fragmentation (RFC 6184 Section 5.8)
      const nalHeader = nal[0];
      const fnri = nalHeader & 0xe0; // F and NRI bits
      const nalType = nalHeader & 0x1f;
      const fuIndicator = fnri | 28; // Type 28 = FU-A

      let offset = 1; // Skip the original 1-byte NAL header
      while (offset < nal.length) {
        const remaining = nal.length - offset;
        const chunkSize = Math.min(MAX_RTP_PAYLOAD, remaining);
        const isStart = offset === 1;
        const isEnd = offset + chunkSize === nal.length;

        // FU header: S | E | R | Type
        let fuHeader = nalType & 0x1f;
        if (isStart) fuHeader |= 0x80;
        if (isEnd) fuHeader |= 0x40;

        const payload = Buffer.alloc(2 + chunkSize);
        payload[0] = fuIndicator;
        payload[1] = fuHeader;
        nal.copy(payload, 2, offset, offset + chunkSize);

        const marker = isLast && isEnd ? 1 : 0;
        this.sendPacket(payload, marker);

        offset += chunkSize;
      }
    }

    this.timestamp = (this.timestamp + durationSamples) >>> 0;
  }

  private sendPacket(payload: Buffer, marker: number): void {
    const packet = new RtpPacket(
      new RtpHeader({
        payloadType: 96,
        marker: marker === 1,
        sequenceNumber: this.sequence,
        timestamp: this.timestamp,
        ssrc: this.ssrc,
      }),
      payload,
    );

    this.videoTrack.writeRtp(packet);
    this.sequence = (this.sequence + 1) & 0xffff;
  }
}

function parseNals(data: Buffer): NalUnit[] {
  const result: NalUnit[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];

  let i = 0;
  while (i < data.length - 2) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) {
        offsets.push(i + 3);
        lengths.push(3);
        i += 3;
        continue;
      } else if (i < data.length - 3 && data[i + 2] === 0 && data[i + 3] === 1) {
        offsets.push(i + 4);
        lengths.push(4);
        i += 4;
        continue;
      }
    }
    i++;
  }

  for (let k = 0; k < offsets.length; k++) {
    const start = offsets[k];
    const end = k + 1 < offsets.length ? offsets[k + 1] - lengths[k + 1] : data.length;
    if (end > start) {
      result.push({
        nal: data.subarray(start, end),
        isLast: false,
      });
    }
  }

  if (result.length > 0) {
    result[result.length - 1].isLast = true;
  }

  return result;
}
