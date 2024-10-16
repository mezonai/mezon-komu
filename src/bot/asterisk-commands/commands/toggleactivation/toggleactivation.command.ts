import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ToggleActiveService } from './toggleactivation.serivces';
import { User } from 'src/bot/models/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Command('toggleactive')
export class ToggleActiveCommand extends CommandMessage {
  constructor(
    @InjectRepository(User)
    private userData: Repository<User>,
    private toggleActiveService: ToggleActiveService,
  ) {
    super();
  }

  messHelp =
    '```' +
    '*toggleactivation username' +
    '\n' +
    '*toggleactivation id' +
    '```';

  async execute(args: string[], message: ChannelMessage) {
    if (args[0] === 'check') {
      const findUser = await this.userData.find({
        where: [{ userId: args[1] }, { username: args[1] }],
      });
      if (findUser.length === 0) {
        return this.replyMessageGenerate(
          { messageContent: this.messHelp },
          message,
        );
      }
      let i = 0;
      let mess = findUser
        .slice(i * 50, (i + 1) * 50)
        .map((user) => `${user.email}(${user.userId}) deactive: ${user.deactive}`)
        .join('\n');
      return this.replyMessageGenerate({ messageContent: mess }, message);
    } else {
      let authorId = args[0];
      const userIdValid = ['1827994776956309504', '1779815181480628224'];
      if (userIdValid.includes(message.sender_id)) {
        const findUserId = await this.toggleActiveService.findAcc(authorId);
        if (!findUserId) {
          return this.replyMessageGenerate(
            {
              messageContent: 'User not found!',
            },
            message,
          );
        }
        if (!findUserId.deactive) {
          await this.toggleActiveService.deactiveAcc(findUserId.userId);
          return this.replyMessageGenerate(
            { messageContent: '✅Disable account successfully!' },
            message,
          );
        } else {
          await this.toggleActiveService.ActiveAcc(findUserId.userId);
          return this.replyMessageGenerate(
            { messageContent: '✅Enable account successfully!' },
            message,
          );
        }
      } else {
        return this.replyMessageGenerate(
          {
            messageContent:
              '❌You do not have permission to execute this command!',
          },
          message,
        );
      }
    }
  }
}
