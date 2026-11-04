import { ChannelMessage } from 'mezon-sdk';
import { CommandDynamic } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { DynamicMezon } from 'src/bot/models';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as ffmpeg from 'fluent-ffmpeg';
import { MezonClientService } from 'src/mezon/services/client.service';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';

@CommandDynamic('dynamic')
export class DynamicExcuteCommand extends CommandMessage {
  constructor(
    @InjectRepository(DynamicMezon)
    private dynamicRepository: Repository<DynamicMezon>,
    private clientService: MezonClientService,
    private dynamicCommandService: DynamicCommandService,
  ) {
    super();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic?.path) {
        ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || ffprobeStatic.path);
      }
    } catch { }
  }

  async getGifSize(url: string) {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { Range: 'bytes=0-9' },
      timeout: 5000,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const buf = Buffer.from(res.data);
    const signature = buf.slice(0, 6).toString('ascii');
    if (signature !== 'GIF87a' && signature !== 'GIF89a') {
      throw new Error('Not a GIF file');
    }

    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { width, height };
  }

  getAttachmentSize(url: string): Promise<{ width: number; height: number }> {
    if (/\.gif(\?|$)/i.test(url)) {
      return this.getGifSize(url);
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(url, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(
          (s) => s.codec_type === 'video',
        );
        if (!videoStream) return reject(new Error('No video stream found'));

        resolve({
          width: videoStream.width,
          height: videoStream.height,
        });
      });
    });
  }

  async execute(args: string[], message: ChannelMessage, commandName: string) {
    try {
      const findCommand = await this.dynamicRepository.findOne({
        where: { command: commandName },
      });
      if (!findCommand) return;
      const rawUrl = JSON.parse(findCommand.output);
      const cleanUrl = rawUrl.split('?')[0];
      let url = rawUrl;

      if (cleanUrl.includes('cdn.mezon.')) {
        let fileChannelId = findCommand.channelId;
        if (!fileChannelId) {
          try {
            const parts = new URL(cleanUrl).pathname.split('/').filter(Boolean);
            if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
              fileChannelId = parts[1];
            }
          } catch { }
        }
        if (!fileChannelId) {
          fileChannelId = message.channel_id;
        }

        try {
          const cdnSig = await this.clientService.getClient().generateCDNSignature({
            channel_id: fileChannelId,
          });
          if (cdnSig?.signature) {
            const sig = cdnSig.signature.startsWith('?')
              ? cdnSig.signature.slice(1)
              : cdnSig.signature;
            url = `${cleanUrl}?${sig}`;
          }
        } catch (sigErr) {
          console.error('[DynamicCommand] Failed to generate CDN signature:', sigErr);
        }
      }

      const extension = cleanUrl.split('.').pop()?.toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(
        extension,
      ); // use with contentType=binary/octet-stream
      const isVideo = [
        'mp4',
        'mov',
        'avi',
        'wmv',
        'flv',
        'mkv',
        'webm',
      ].includes(extension); // use with contentType=binary/octet-stream
      const response = await axios.head(url);
      let attachmentSize = { width: 0, height: 0 };
      try {
        attachmentSize = await this.getAttachmentSize(url);
      } catch (sizeErr: any) {
        if (
          sizeErr?.response?.status === 403 ||
          sizeErr?.status === 403 ||
          String(sizeErr?.message).includes('403')
        ) {
          throw sizeErr;
        }
        console.warn('[DynamicCommand] Failed to get attachment size:', sizeErr);
      }
      let contentType = String(response.headers['content-type'] ?? '');

      if (contentType.includes('binary/octet-stream')) {
        if (isImage) {
          contentType = `image/${extension}`;
        } else if (isVideo) {
          contentType = `video/${extension}`;
        }
      }
      return this.replyMessageGenerate(
        {
          attachments: [
            {
              url,
              filetype: contentType,
              width: attachmentSize.width,
              height: attachmentSize.height,
            },
          ],
        },
        message,
        true,
        message.references,
      );
    } catch (error: any) {
      console.error('[DynamicCommand] Execution error:', error);
      const is403 =
        error?.response?.status === 403 ||
        error?.status === 403 ||
        String(error?.message).includes('403');

      if (is403) {
        try {
          await this.dynamicRepository.delete({ command: commandName });
          await this.dynamicCommandService.initDynamicCommandList();
          console.log(`[DynamicCommand] Deleted invalid command *${commandName} due to 403 error.`);
        } catch (delErr) {
          console.error('[DynamicCommand] Failed to delete 403 dynamic command:', delErr);
        }

        const messageContent =
          'The old file is no longer accessible. Command has been deleted, please recreate it!';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 'pre', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
    }
  }
}
