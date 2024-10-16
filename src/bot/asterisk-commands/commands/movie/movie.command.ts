import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { FFmpegService } from 'src/bot/services/ffmpeg.service';
import { FileType } from 'src/bot/constants/configs';
import { Uploadfile } from 'src/bot/models';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Command('movie')
export class MovieCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    private clientConfigService: ClientConfigService,
    private axiosClientService: AxiosClientService,
    private clientService: MezonClientService,
    private ffmpegService: FFmpegService,
    @InjectRepository(Uploadfile)
    private uploadFileData: Repository<Uploadfile>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  removeFileNameExtension(fileName: string, isSubtitle?: boolean) {
    const withoutFirstFiveChars = fileName.substring(isSubtitle ? 0 : 5);
    const lastDotIndex = withoutFirstFiveChars.lastIndexOf('.');
    const finalFileName = withoutFirstFiveChars.substring(0, lastDotIndex);
    return finalFileName;
  }

  generateFileSubtitlePath(filePath: string) {
    const lastDotIndex = filePath.lastIndexOf('.');
    const fileSubtitlePath = filePath.substring(0, lastDotIndex);
    return fileSubtitlePath.replace('film_', '');
  }

  async execute(args: string[], message: ChannelMessage) {
    const messageContent =
      '```' +
      'Command: *movie play ID' +
      '\n' +
      'Example: *movie play 1' +
      '```';
    if (args[0] === 'play') {
      if (!args[1])
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );

      const textContent = `Go to `;
      const channel_id = this.clientConfigService.movieChannelId;
      try {
        // call api in sdk
        const channel = await this.client.registerStreamingChannel({
          clan_id: message.clan_id,
          channel_id: channel_id,
        });

        if (!channel) return;

        const res = await this.axiosClientService.get(
          `${process.env.NCC8_API}/ncc8/film/${args[1]}`,
        );
        if (!res) return;

        // check channel is not streaming
        // ffmpeg mp3 to streaming url
        if (channel?.streaming_url !== '') {
          this.ffmpegService
            .transcodeVideoToRtmp(
              res?.data?.url,
              channel?.streaming_url,
              this.generateFileSubtitlePath(res?.data?.url),
            )
            .catch((error) => console.log('error video', error));
        }

        await sleep(1000);

        return this.replyMessageGenerate(
          {
            messageContent: textContent,
            hg: [
              {
                channelid: channel_id,
                s: textContent.length,
                e: textContent.length + 1,
              },
            ],
          },
          message,
        );
      } catch (error) {
        console.log('error', message.clan_id, channel_id, error);
        return this.replyMessageGenerate(
          {
            messageContent: 'Movie not found',
          },
          message,
        );
      }
    }

    if (args[0] === 'playlist') {
      console.log('playlist');
      const dataMp3 = await this.uploadFileData.find({
        where: {
          file_type: FileType.FILM,
        },
        order: {
          episode: 'DESC',
        },
      });
      if (!dataMp3) {
        return;
      } else if (Array.isArray(dataMp3) && dataMp3.length === 0) {
        const mess = '```' + 'Không có movie nào' + '```';
        return this.replyMessageGenerate(
          {
            messageContent: mess,
            mk: [{ type: 't', s: 0, e: mess.length }],
          },
          message,
        );
      } else {
        const listReplyMessage = [];
        for (let i = 0; i <= Math.ceil(dataMp3.length / 50); i += 1) {
          if (dataMp3.slice(i * 50, (i + 1) * 50).length === 0) break;
          const mess =
            '```Danh sách movie\n' +
            dataMp3
              .slice(i * 50, (i + 1) * 50)
              .filter((item) => item.episode)
              .map(
                (list) =>
                  `Id: ${list.episode}, name: ${this.removeFileNameExtension(list.fileName)}`,
              )
              .join('\n') +
            '```';
          listReplyMessage.push(mess);
        }
        return listReplyMessage.map((mess) => {
          return this.replyMessageGenerate(
            {
              messageContent: mess,
              mk: [{ type: 't', s: 0, e: mess.length }],
            },
            message,
          );
        });
      }
    }
    return this.replyMessageGenerate(
      {
        messageContent: messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
