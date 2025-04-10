import { ChannelMessage } from 'mezon-sdk';
import { CommandDynamic } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { DynamicMezon } from 'src/bot/models';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as ffmpeg from 'fluent-ffmpeg';

@CommandDynamic('dynamic')
export class DynamicExcuteCommand extends CommandMessage {
  constructor(
    @InjectRepository(DynamicMezon)
    private dynamicRepository: Repository<DynamicMezon>,
  ) {
    super();
  }

  getAttachmentSize(url: string): Promise<{ width: number; height: number }> {
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
      const url = JSON.parse(findCommand.output);
      const extension = url.split('.').pop()?.toLowerCase();
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
      const attachmentSize = await this.getAttachmentSize(url);
      let contentType = response.headers['content-type'];

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
    } catch (error) {
      console.log('error', error);
    }
  }
}
