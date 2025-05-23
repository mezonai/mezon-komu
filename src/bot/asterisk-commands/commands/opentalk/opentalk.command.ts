import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { OpentalkService } from 'src/bot/services/opentalk.services';

@Command('opt')
export class OpentalkCommand extends CommandMessage {
  constructor(
    private opentalkService: OpentalkService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  isValidDateFormat(input: string): boolean {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    return regex.test(input);
  }

  chunkArray<T>(array: T[], chunkSize: number) {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args?.length) {
      const messageContent = '```Command *opt dd/MM/yyyy```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'set') {
      if (message.sender_id !== '1827994776956309504') return
      const channelsList = args.slice(1);
      this.opentalkService.setValidChannelIds(channelsList);
      const listChannelValid = this.opentalkService.getValidChannelIds();
      const messageContent =
        '```' +
        `List channel: ${channelsList}\nSet list channel opentalk valid success! Current channel: ${listChannelValid.join(', ')}` +
        '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'add') {
      if (message.sender_id !== '1827994776956309504') return
      const channelsList = args.slice(1);
      this.opentalkService.addValidChannelIds(channelsList);
      const listChannelValid = this.opentalkService.getValidChannelIds();
      const messageContent =
        '```' +
        `List add channel: ${channelsList}\nSet list channel opentalk valid success! Current channels: ${listChannelValid.join(', ')}` +
        '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'remove') {
      if (message.sender_id !== '1827994776956309504') return
      const channelsList = args.slice(1);
      this.opentalkService.removeValidChannelIds(channelsList[0]);
      const listChannelValid = this.opentalkService.getValidChannelIds();
      const messageContent =
        '```' +
        `List remove channel: ${channelsList}\nSet list channel opentalk valid success! Current channels: ${listChannelValid.join(', ')}` +
        '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'list') {
      if (message.sender_id !== '1827994776956309504') return
      const listChannelValid = this.opentalkService.getValidChannelIds();
      const messageContent =
        '```' + `Current channels: ${listChannelValid ?? 'empty'}` + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'removeAll') {
      if (message.sender_id !== '1827994776956309504') return
      this.opentalkService.removeAllValidChannelIds();
      const messageContent = '```' + `Romove all channel success!` + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    const total = await this.opentalkService.getAllUsersVoiceTime(
      message.clan_id,
      args[0],
    );
    const messages = await Promise.all(
      total.map(async (data) => {
        const findUser = await this.userRepository.findOne({
          where: { userId: data.user_id },
        });

        if (!findUser) return null;

        return `- ${findUser.clan_nick || findUser.username} join opentalk tổng cộng được: ${data?.totalMinutes ?? 0} phút!`;
      }),
    );

    const messageArray = messages.filter((msg) => msg !== null);
    const chunks = this.chunkArray(messageArray, 50);
    const messagesSend = [];
    chunks.map((messages) => {
      const messageContent = '```' + messages.join('\n') + '```';
      const messageReply = this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
      messagesSend.push(messageReply);
    });
    return messagesSend;
  }
}
