import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon, Meeting } from 'src/bot/models';
import { Repository } from 'typeorm';
import { MezonClientService } from 'src/mezon/services/client.service';

@Command('checkchannel')
export class CheckChannelCommand extends CommandMessage {
  private client: MezonClient;

  constructor(
    private clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] || message.sender_id !== '1827994776956309504') return;
    if (args[0] === 'client') {
      if (!args[1]) return;
      const channel = await this.client.channels.fetch(args[1]);
      const channelData = {
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private,
        channel_type: channel.channel_type,
        category_id: channel.category_id,
        category_name: channel.category_name,
        parent_id: channel.parent_id,
        meeting_code: channel.meeting_code,
      };
      const messageContent = JSON.stringify(channelData);
      return this.replyMessageGenerate(
        {
          messageContent,
        },
        message,
      );
    }
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
