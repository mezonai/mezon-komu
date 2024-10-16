import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon } from 'src/bot/models';
import { Repository } from 'typeorm';

@Command('checkchannel')
export class CheckChannelCommand extends CommandMessage {
  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] || message.sender_id !== '1827994776956309504') return;
    const findChannel = await this.channelRepository.findOne({
      where: { channel_id: args[0] },
    });
    if (!findChannel) return;
    const messageContent = JSON.stringify(findChannel);
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
