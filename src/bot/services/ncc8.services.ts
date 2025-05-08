import { Injectable } from '@nestjs/common';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffprobePath from 'ffprobe-static';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs';
import WebSocket from 'ws';

@Injectable()
export class NCC8Service {
  private ws: WebSocket;

  constructor() {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath.path);
  }

  connectSocket() {
    this.ws = new WebSocket(
      `wss://stn.mezon.ai/ws?token=${process.env.BOT_TOKEN}`,
    );
  }

  wsSend(filePath: string, key: any) {
    const params = {
      ChannelId: process.env.MEZON_NCC8_CHANNEL_ID,
      Password: '',
      FileUrl: filePath,
    };

    const messageSocket = {
      ClanId: process.env.KOMUBOTREST_CLAN_NCC_ID,
      ChannelId: process.env.MEZON_NCC8_CHANNEL_ID,
      UserId: process.env.BOT_KOMU_ID,
      Value: params,
    };

    const json = JSON.stringify({ ...messageSocket, ...key });
    console.log('json', json)
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(json);
    } else {
      console.debug('ws: send not ready, skipping...', json);
    }
  }

  playNcc8(filePath: string) {
    this.connectSocket();
    this.ws.on('open', () => {
      this.wsSend(filePath, { Key: 'connect_publisher' });
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
