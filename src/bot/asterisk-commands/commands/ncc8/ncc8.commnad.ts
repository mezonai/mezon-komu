import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { FFmpegService } from 'src/bot/services/ffmpeg.service';
import { Ncc8 } from 'src/bot/models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EmbedProps } from 'src/bot/constants/configs';
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
    @InjectRepository(Ncc8)
    private ncc8Data: Repository<Ncc8>,
    private ncc8Service: NCC8Service,
  ) {
    super();
  }

  @Cron('11 12 * * 1,3,5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async stopNCC8Schedule() {
    await this.ncc8Service.stopNcc8();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (
      ![
        '1827994776956309504',
        '1779815181480628224',
        '1820647107783036928',
        '1835567711413866496',
      ].includes(message.sender_id)
    )
      return;

    switch (args[0]) {
      case 'play':
        return this.handlePlay(args, message);
      case 'stop':
        return this.handleStop();
      case 'add':
        return this.handleAdd(args, message);
      case 'toggleactive':
        return this.handleToggleActive(args, message);
      case 'playlist':
        return this.handlePlaylist(args, message);
      // case 'summary':
      //   return this.handleSummary(args, message);
      default:
        return this.replyHelp(message);
    }
  }

  private async handlePlay(args: string[], message: ChannelMessage) {
    const ncc8Id = args[1] ? Number(args[1]) : undefined;

    if (args[1] && (!Number.isInteger(ncc8Id) || ncc8Id <= 0)) {
      return this.replyText('❌ NCC8 ID must be a positive integer.', message);
    }

    const ncc8 = await this.ncc8Data.findOne({
      where: args[1] ? { ncc8Id, isActive: true } : { isActive: true },
      order: args[1]
        ? { id: 'DESC' }
        : { ncc8Id: 'DESC', id: 'DESC' },
    });

    if (!ncc8?.url) {
      const notFoundMessage = args[1]
        ? `❌ NCC8 ${ncc8Id} not found.`
        : '❌ No active NCC8 found.';
      return this.replyText(notFoundMessage, message);
    }

    const textContent = 'Go to #ncc8-radio';
    try {
      await this.ncc8Service.playNcc8(ncc8.url);
    } catch (error) {
      console.error('Failed to publish NCC8 through SFU:', error);
      return this.replyText(
        '❌ Cannot connect NCC8 to the Mezon SFU.',
        message,
      );
    }
    return this.replyMessageGenerate(
      {
        messageContent: textContent,
        hg: [
          {
            channelId: this.clientConfigService.ncc8ChannelId,
            s: 6,
            e: textContent.length + 1,
          },
        ],
      },
      message,
    );
  }

  private async handleStop() {
    await this.ncc8Service.stopNcc8();
  }

  private async handleAdd(args: string[], message: ChannelMessage) {
    if (!args[1]) return this.replyHelp(message);

    const ncc8Id = Number(args[1]);
    const attachment = message.attachments?.[0];

    if (!Number.isInteger(ncc8Id) || ncc8Id <= 0) {
      return this.replyText('❌ NCC8 ID must be a positive integer.', message);
    }

    const activeNcc8Exists = await this.ncc8Data.exists({
      where: { ncc8Id, isActive: true },
    });

    if (activeNcc8Exists) {
      return this.replyText(`❌ NCC8 ${ncc8Id} is already active.`, message);
    }

    if (!attachment?.url || !attachment?.filename) {
      return this.replyText('❌ Please attach an NCC8 audio file.', message);
    }

    try {
      const codecInfo = await this.ffmpegService.getVideoCodecInfo(
        attachment.url,
      );
      if (codecInfo.audio.toLowerCase() !== 'opus') {
        return this.replyText(
          `❌ NCC8 audio codec must be Opus. Detected: ${
            codecInfo.audio || 'unknown'
          }.`,
          message,
        );
      }
    } catch (error) {
      console.error('Failed to read NCC8 audio codec:', error);
      return this.replyText(
        '❌ Cannot read the attached audio codec.',
        message,
      );
    }

    await this.ncc8Data.insert({
      ncc8Id,
      url: attachment.url,
      fileName: attachment.filename,
      author: message.username,
      isActive: true,
    });

    return this.replyText(`✅ NCC8 ${ncc8Id} added successfully.`, message);
  }

  private async handleToggleActive(args: string[], message: ChannelMessage) {
    if (!args[1]) return this.replyHelp(message);

    const id = Number(args[1]);

    if (!Number.isInteger(id) || id <= 0) {
      return this.replyText('❌ ID must be a positive integer.', message);
    }

    const ncc8 = await this.ncc8Data.findOne({
      where: { id },
    });

    if (!ncc8) {
      return this.replyText(`❌ NCC8 with ID ${id} not found.`, message);
    }

    ncc8.isActive = !ncc8.isActive;
    await this.ncc8Data.save(ncc8);

    return this.replyText(
      `✅ Id: ${id}. Ncc8 số ${ncc8.ncc8Id} is now ${
        ncc8.isActive ? 'active' : 'inactive'
      }.`,
      message,
    );
  }

  private async handlePlaylist(args: string[], message: ChannelMessage) {
    const isInactivePlaylist = args[1]?.toLowerCase() === 'inactive';
    const ncc8Playlist = await this.ncc8Data.find({
      where: { isActive: !isInactivePlaylist },
      order: { ncc8Id: 'DESC', id: 'DESC' },
    });

    if (ncc8Playlist.length === 0) {
      return this.replyText(
        isInactivePlaylist
          ? 'Không có NCC8 inactive nào'
          : 'Không có NCC8 active nào',
        message,
      );
    }

    const listReplyMessage = [];
    for (let i = 0; i < Math.ceil(ncc8Playlist.length / 50); i += 1) {
      const playlistPage = ncc8Playlist.slice(i * 50, (i + 1) * 50);
      const messageContent =
        `Danh sách NCC8 ${isInactivePlaylist ? 'inactive' : 'active'}\n` +
        playlistPage
          .map(
            (item) =>
              `Id: ${item.id}. Ncc8 số ${item.ncc8Id}. ${
                isInactivePlaylist
                  ? `(*ncc8 toggleactive ${item.id})`
                  : `(*ncc8 play ${item.ncc8Id}) (*ncc8 toggleactive ${item.id})`
              }`,
          )
          .join('\n');
      listReplyMessage.push(this.replyText(messageContent, message));
    }

    return listReplyMessage;
  }

  private async handleSummary(args: string[], message: ChannelMessage) {
    try {
      const res = await this.axiosClientService.get(
        `${process.env.NCC8_API}/ncc8/episode/${args[1]}`,
      );
      if (!res || !res?.data?.url) {
        return this.replyText('NCC8 not found', message);
      }

      const waitingMessage = 'Summarizing...';
      this.clientService.sendMessage(
        this.replyMessageGenerate(
          {
            messageContent: waitingMessage,
            mk: [{ type: 'pre', s: 0, e: waitingMessage.length }],
          },
          message,
        ),
      );

      const fileName = path.basename(res.data.url);
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
          description: `${data?.response}`,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Powered by Mezon',
            icon_url:
              'https://cdn.mezon.vn/1837043892743049216/1840654271217930240/1827994776956309500/857_0246x0w.webp',
          },
        },
      ];
      return this.replyMessageGenerate({ embed }, message);
    } catch (error) {
      return this.replyText(
        'Ncc8 not found or getting error when trying summary!',
        message,
      );
    }
  }

  private replyHelp(message: ChannelMessage) {
    const messageContent =
      'Commands:\n' +
      '*ncc8 play ID\n' +
      '*ncc8 add ID (attach an audio file)\n' +
      '*ncc8 playlist\n' +
      '*ncc8 playlist inactive\n' +
      '*ncc8 toggleactive DATABASE_ID\n' +
      '*ncc8 stop\n'+
      'Example: *ncc8 play 190';
    return this.replyText(messageContent, message);
  }

  private replyText(messageContent: string, message: ChannelMessage) {
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
