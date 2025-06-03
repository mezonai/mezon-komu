import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { EUserType } from 'src/bot/constants/configs';

@Command('togglebuzz')
export class ToggleBuzzCommand extends CommandMessage {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent =
      '' +
      'Command: *togglebuzz daily' +
      '\n' +
      'Command: *togglebuzz ncc8' +
      '';
    if (args[0] === 'daily') {
      const findUser = await this.userRepository.findOne({
        where: { userId: message.sender_id, user_type: EUserType.MEZON },
      });
      await this.userRepository.update(
        { userId: message.sender_id },
        { buzzDaily: !findUser?.buzzDaily },
      );
      messageContent =
        '' +
        (findUser?.buzzDaily
          ? 'Disable BUZZ daily successful!'
          : 'Enable BUZZ daily successful!') +
        '';
    }
    if (args[0] === 'ncc8') {
      const findUser = await this.userRepository.findOne({
        where: { userId: message.sender_id, user_type: EUserType.MEZON },
      });
      await this.userRepository.update(
        { userId: message.sender_id },
        { buzzNcc8: !findUser?.buzzNcc8 },
      );
      messageContent =
        '' +
        (findUser?.buzzNcc8
          ? 'Disable BUZZ ncc8 successful!'
          : 'Enable BUZZ ncc8 successful!') +
        '';
    }

    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
