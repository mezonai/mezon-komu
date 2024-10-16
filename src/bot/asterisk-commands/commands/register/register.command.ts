import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { Dynamic, User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ChannelMessage } from 'mezon-sdk';
import { TABLE } from 'src/bot/constants/table';

@Command('register')
export class RegisterCommand extends CommandMessage {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Dynamic)
    private dynamicRepository: Repository<Dynamic>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] || !args[1]) return;
    await this.dynamicRepository
      .createQueryBuilder(TABLE.DYNAMIC)
      .insert()
      .into(Dynamic)
      .values({
        userId: message.sender_id,
        command: args[0],
        output: JSON.stringify({ text: args[1], option: message.content }),
      })
      .execute();
    const a = await this.dynamicRepository.find();
    // return this.replyMessageGenerate(
    //   {
    //     messageContent: EPenaltyCommand.HELP,
    //     mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
    //   },
    //   message,
    // );
  }
}
