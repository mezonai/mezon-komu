import { ChannelMessage } from 'mezon-sdk';
import { CommandMessage } from '../../abstracts/command.abstract';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Daily, User } from 'src/bot/models';
import { dailyHelp } from './daily.constants';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { generateEmail, getUserNameByEmail } from 'src/bot/utils/helper';
import { TimeSheetService } from 'src/bot/services/timesheet.services';
import { checkTimeNotWFH, checkTimeSheet } from './daily.functions';

@Command('daily')
export class DailyCommand extends CommandMessage {
  constructor(
    private timeSheetService: TimeSheetService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Daily) private dailyRepository: Repository<Daily>,
  ) {
    super();
  }

  validateMessage(args: string[]) {
    if (args[0] === 'help') return dailyHelp;
    const daily = args.join(' ');
    let checkDaily = false;
    const wordInString = (s, word) =>
      new RegExp('\\b' + word + '\\b', 'i').test(s);
    ['yesterday', 'today', 'block'].forEach((q) => {
      if (!wordInString(daily, q)) return (checkDaily = true);
    });

    if (checkDaily) return dailyHelp;

    if (!daily || daily == undefined) {
      return '```please add your daily text```';
    }

    if (daily.length < 100) {
      return '```Please enter at least 100 characters in your daily text```';
    }

    return false;
  }

  async execute(args: string[], message: ChannelMessage) {
    const content = message.content.t;

    const messageValidate = this.validateMessage(args);

    if (messageValidate)
      return this.replyMessageGenerate(
        {
          messageContent: messageValidate,
          mk: [{ type: 't', s: 0, e: messageValidate.length }],
        },
        message,
      );

    const senderId = message.sender_id;
    const findUser = await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :userId`, { userId: senderId })
      .andWhere(`"deactive" IS NOT true`)
      .select('*')
      .getRawOne();
    if (!findUser) return;
    const authorUsername = findUser.email;
    const emailAddress = generateEmail(authorUsername);

    const wfhResult = await this.timeSheetService.findWFHUser();

    const wfhUserEmail = wfhResult.map((item) =>
      getUserNameByEmail(item.emailAddress),
    );

    await this.saveDaily(message, args, authorUsername);

    await this.timeSheetService.logTimeSheetFromDaily({
      emailAddress,
      content: content,
    });

    const isValidTimeFrame = checkTimeSheet();
    const isValidWFH = checkTimeNotWFH();
    const baseMessage = '```✅ Daily saved.```';
    const errorMessageWFH =
      '```✅ Daily saved. (Invalid daily time frame. Please daily at 7h30-9h30, 12h-17h. WFH not daily 20k/time.)```';
    const errorMessageNotWFH =
      '```✅ Daily saved. (Invalid daily time frame. Please daily at 7h30-17h. not daily 20k/time.)```';

    const messageContent = wfhUserEmail.includes(authorUsername)
      ? isValidTimeFrame
        ? baseMessage
        : errorMessageWFH
      : isValidWFH
        ? baseMessage
        : errorMessageNotWFH;

    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }

  saveDaily(message: ChannelMessage, args: string[], email: string) {
    return this.dailyRepository
      .createQueryBuilder()
      .insert()
      .into(Daily)
      .values({
        userid: message.sender_id,
        email: email,
        daily: args.join(' '),
        createdAt: Date.now(),
        channelid: message.channel_id,
      })
      .execute();
  }
}
