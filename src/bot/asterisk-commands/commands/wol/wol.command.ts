import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { WOL } from 'src/bot/models';
import { Repository } from 'typeorm';
import { CommandMessage } from '../../abstracts/command.abstract';
import { EWolCommand } from './wol.constants';
import { WolCommandService } from './wol.services';

@Command('wol')
export class WolCommand extends CommandMessage {
  constructor(
    @InjectRepository(WOL)
    private readonly wolRepository: Repository<WOL>,
    private readonly wolCommandService: WolCommandService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const checkChannel =
      message.channel_id === process.env.MEZON_WOL_CHANNEL_ID;
    if (!checkChannel) {
      const messageContent = "Can't use *wol here. Please go to wake-on-lan thread #";
      return this.replyMessageGenerate(
        {
          messageContent,
          hg: [
            {
              channelid: process.env.MEZON_WOL_CHANNEL_ID,
              s: messageContent.length - 1,
              e: messageContent.length,
            },
          ],
        },
        message,
      );
    }
    let messageContent: EWolCommand;
    const authorId = message.sender_id;
    const timeStamp = Date.now();
    if (!args[0]) {
      const myWOL = await this.wolRepository.findOneBy({ author: authorId });
      if (myWOL) {
        const agrs = myWOL.wol.split(' ');
        messageContent = await this.wolCommandService.handleWoL(agrs);
      } else {
        messageContent = EWolCommand.HAVE_NOT_WOL;
      }
    } else if (args[0] === 'help') {
      messageContent = EWolCommand.HELP;
    } else {
      const wol = args.join(' ');
      const checkUser = await this.wolRepository.findOneBy({
        author: authorId,
      });
      if (!checkUser) {
        await this.wolRepository.save({
          author: authorId,
          wol: wol,
          createdAt: timeStamp,
        });
      } else {
        await this.wolRepository.update({ author: authorId }, { wol: wol });
      }
      messageContent = await this.wolCommandService.handleWoL(args);
    }
    return this.replyMessageGenerate({ messageContent }, message);
  }
}
