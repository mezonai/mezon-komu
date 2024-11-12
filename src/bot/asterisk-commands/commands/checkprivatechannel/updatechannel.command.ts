import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon, Meeting } from 'src/bot/models';
import { Repository } from 'typeorm';
import { MeetingService } from '../meeting/meeting.services';

@Command('togglechannel')
export class ToggleCheckChannelCommand extends CommandMessage {
  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    private meetingService: MeetingService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] || message.sender_id !== '1827994776956309504') return;
    if (args[0] === 'private') {
      if (!args[1]) return;
      const findChannel = await this.channelRepository.findOne({
        where: { channel_id: args[1] },
      });
      if (!findChannel) return;
      await this.channelRepository.update(
        { channel_id: args[1] },
        { channel_private: findChannel.channel_private ? 0 : 1 },
      );
      const findNewChannel = await this.channelRepository.findOne({
        where: { channel_id: args[1] },
      });
      const messageContent = JSON.stringify(findNewChannel);
      return this.replyMessageGenerate(
        {
          messageContent,
        },
        message,
      );
    }

    if (args[0] === 'meeting') {
      const findChannelId = await this.meetingService.cancelMeetingByChannelId(
        args[1],
      );
      return this.replyMessageGenerate(
        {
          messageContent: !findChannelId
            ? 'Not found.'
            : '✅ Cancel all channel meeting successfully.',
        },
        message,
      );
    }
  }
}
