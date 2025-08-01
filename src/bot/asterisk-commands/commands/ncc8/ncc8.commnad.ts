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
import { EmbedProps, FileType } from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import path from 'path';
import { NCC8Service } from 'src/bot/services/ncc8.services';
import { Cron } from '@nestjs/schedule';

@Command('ncc8')
export class Ncc8Command extends CommandMessage {
  constructor(
    private clientConfigService: ClientConfigService,
    private axiosClientService: AxiosClientService,
    private clientService: MezonClientService,
    private ffmpegService: FFmpegService,
    @InjectRepository(Uploadfile)
    private uploadFileData: Repository<Uploadfile>,
    private ncc8Service: NCC8Service,
  ) {
    super();
  }

  @Cron('1 12 * * 1,5', { timeZone: 'Asia/Ho_Chi_Minh' })
  stopNCC8Schedule() {
    this.ncc8Service.wsSend('', { Key: 'stop_publisher' });
  }

  async execute(args: string[], message: ChannelMessage) {
    if (
      !['1827994776956309504', '1779815181480628224'].includes(
        message.sender_id,
      )
    )
      return;
    const messageContent =
      '' + 'Command: *ncc8 play ID' + '\n' + 'Example: *ncc8 play 190' + '';

    if (args[0] === 'play') {
      // if (!args[1])
      //   return this.replyMessageGenerate(
      //     {
      //       messageContent: messageContent,
      //       mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      //     },
      //     message,
      //   );
      const textContent = `Go to `;
      const res = await this.axiosClientService.get(
        `${process.env.NCC8_API}/ncc8/episode/${args[1] ?? '1'}`,
      );
      console.log('res?.data?.url', res?.data?.url);
      if (!res) return;
      // this.ncc8Service.ncc8Play('https://raw.githubusercontent.com/mezonai/mezon-go-bot/refs/heads/main/audio/ncc8.ogg');
      this.ncc8Service.playNcc8(
        res?.data?.url?.replace(/\.mp3$/, '.ogg') ?? '',
      );
      return this.replyMessageGenerate(
        {
          messageContent: textContent,
          hg: [
            {
              channelid: this.clientConfigService.ncc8ChannelId,
              s: textContent.length,
              e: textContent.length + 1,
            },
          ],
        },
        message,
      );
    }

    if (args[0] === 'stop') {
      this.ncc8Service.wsSend('', { Key: 'stop_publisher' });
      return;
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
        const mess = '' + 'Không có NCC nào' + '';
        return this.replyMessageGenerate(
          {
            messageContent: mess,
            mk: [{ type: 'pre', s: 0, e: mess.length }],
          },
          message,
        );
      } else {
        const listReplyMessage = [];
        for (let i = 0; i <= Math.ceil(dataMp3.length / 50); i += 1) {
          if (dataMp3.slice(i * 50, (i + 1) * 50).length === 0) break;
          const mess =
            'Danh sách NCC8\n' +
            dataMp3
              .slice(i * 50, (i + 1) * 50)
              .filter((item) => item.episode)
              .map((list) => `NCC8 số ${list.episode}`)
              .join('\n') +
            '';
          listReplyMessage.push(mess);
        }
        return listReplyMessage.map((mess) => {
          return this.replyMessageGenerate(
            {
              messageContent: mess,
              mk: [{ type: 'pre', s: 0, e: mess.length }],
            },
            message,
          );
        });
      }
    }

    if (args[0] === 'summary') {
      try {
        const res = await this.axiosClientService.get(
          `${process.env.NCC8_API}/ncc8/episode/${args[1]}`,
        );
        if (!res || !res?.data?.url) {
          const messageContent = 'NCC8 not found';
          return this.replyMessageGenerate(
            {
              messageContent: messageContent,
              mk: [{ type: 'pre', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        const messageWatting = 'Summarizing...';
        const dataSendWatting = this.replyMessageGenerate(
          {
            messageContent: messageWatting,
            mk: [{ type: 'pre', s: 0, e: messageWatting.length }],
          },
          message,
        );
        this.clientService.sendMessage(dataSendWatting);
        const fileName = path.basename(res?.data?.url);
        const { data } = await this.axiosClientService.post(
          process.env.NCC8_SUMARY_API,
          {
            file_name: fileName,
          },
        );
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `NCC8 SUMARY SỐ ${args[1]}`,
            description: '' + `${data?.response}` + '',
            timestamp: new Date().toISOString(),
            footer: {
              text: 'Powered by Mezon',
              icon_url:
                'https://cdn.mezon.vn/1837043892743049216/1840654271217930240/1827994776956309500/857_0246x0w.webp',
            },
          },
        ];
        return this.replyMessageGenerate(
          {
            embed,
          },
          message,
        );
      } catch (error) {
        const messageContent =
          'Ncc8 not found or getting error when trying summary!';
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 'pre', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
    }

    return this.replyMessageGenerate(
      {
        messageContent: messageContent,
        mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
