import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { FFmpegService } from 'src/bot/services/ffmpeg.service';
import { Uploadfile } from 'src/bot/models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FileType } from 'src/bot/constants/configs';
import { FFmpegImagePath } from 'src/bot/constants/configs';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Command('ncc8')
export class Ncc8Command extends CommandMessage {
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

  async execute(args: string[], message: ChannelMessage) {
    const messageContent =
      '```' +
      'Command: *ncc8 play ID' +
      '\n' +
      'Example: *ncc8 play 180' +
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
      const channel_id = this.clientConfigService.ncc8ChannelId;
      try {
        // call api in sdk
        const channel = await this.client.registerStreamingChannel({
          clan_id: message.clan_id,
          channel_id: channel_id,
        });

        if (!channel) return;

        const res = await this.axiosClientService.get(
          `${process.env.NCC8_API}/ncc8/episode/${args[1]}`,
        );
        if (!res) return;

        // check channel is not streaming
        // ffmpeg mp3 to streaming url
        if (channel?.streaming_url !== '') {
          this.ffmpegService
            .transcodeMp3ToRtmp(
              FFmpegImagePath.NCC8,
              res?.data?.url,
              channel?.streaming_url,
              FileType.NCC8,
            )
            .catch((error) => console.log('error mp3', error));
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
            messageContent: 'Ncc8 not found',
          },
          message,
        );
      }
    }

    if (args[0] === 'playlist') {
      const dataMp3 = await this.uploadFileData.find({
        where: {
          file_type: FileType.NCC8,
        },
        order: {
          episode: 'DESC',
        },
      });
      if (!dataMp3) {
        return;
      } else if (Array.isArray(dataMp3) && dataMp3.length === 0) {
        const mess = '```' + 'Không có NCC nào' + '```';
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
            '```Danh sách NCC8\n' +
            dataMp3
              .slice(i * 50, (i + 1) * 50)
              .filter((item) => item.episode)
              .map((list) => `NCC8 số ${list.episode}`)
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

    // TODO: stop stream
    // if (args[0] === 'stop') {
    //   this.ffmpegService.killCurrentStream(FileType.NCC8);
    //   await sleep(1000);
    //   const messageEply = '```Stop ncc8 successful!```';
    //   return this.replyMessageGenerate(
    //     {
    //       messageContent: messageEply,
    //       mk: [{ type: 't', s: 0, e: messageEply.length }],
    //     },
    //     message,
    //   );
    // }

    return this.replyMessageGenerate(
      {
        messageContent: messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
