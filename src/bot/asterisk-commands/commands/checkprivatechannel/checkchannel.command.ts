import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon, Meeting } from 'src/bot/models';
import { Repository } from 'typeorm';

@Command('checkchannel')
export class CheckChannelCommand extends CommandMessage {
  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] || message.sender_id !== '1827994776956309504') return;
    const findChannel = await this.channelRepository.findOne({
      where: { channel_id: args[0] },
    });
    if (args[0] === 'meeting') {
      if (!args[1]) return;
      const findMeeting = await this.meetingRepository.find({
        where: { channelId: args[1] },
      });
      if (!findMeeting) {
        return this.replyMessageGenerate(
          {
            messageContent: 'Not found this channel',
          },
          message,
        );
      }
      const messageContent = JSON.stringify(findMeeting);
      return this.replyMessageGenerate(
        {
          messageContent,
        },
        message,
      );
    }
    if (!findChannel) {
      return this.replyMessageGenerate(
        {
          messageContent: 'Not found this channel',
        },
        message,
      );
    }
    const messageContent = JSON.stringify(findChannel);
    return this.replyMessageGenerate(
      {
        messageContent,
      },
      message,
    );
  }
}
