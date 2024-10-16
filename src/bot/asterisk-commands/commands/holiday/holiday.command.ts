import { Command } from 'src/bot/base/commandRegister.decorator';
import { ChannelMessage } from 'mezon-sdk';
import { CommandMessage } from '../../abstracts/command.abstract';
import { Holiday } from 'src/bot/models/holiday.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EHolidayCommand } from './holiday.constants';

@Command('holiday')
export class HolidayCommand extends CommandMessage {
  constructor(
    @InjectRepository(Holiday)
    private holidayRepository: Repository<Holiday>,
  ) {
    super();
  }

  async addHoliday(dateTime, messageHoliday) {
    await this.holidayRepository.insert({
      dateTime: dateTime,
      content: messageHoliday,
    });
  }

  async deleteHoliday(dateTime) {
    await this.holidayRepository.delete({
      dateTime: dateTime,
    });
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args[0] && !args[1] && !args[2]) {
      return this.replyMessageGenerate(
        {
          messageContent: EHolidayCommand.HELP,
          mk: [{ type: 't', s: 0, e: EHolidayCommand.HELP.length }],
        },
        message,
      );
    }

    const dateTime = args.slice(1, 2).join(' ');
    const messageHoliday = args.slice(2).join(' ');
    if (
      !/^(((0[1-9]|[12]\d|3[01])\/(0[13578]|1[02])\/((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\/(0[13456789]|1[012])\/((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\/02\/((19|[2-9]\d)\d{2}))|(29\/02\/((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|(([1][26]|[2468][048]|[3579][26])00))))$/.test(
        dateTime,
      )
    ) {
      return this.replyMessageGenerate(
        {
          messageContent: EHolidayCommand.HELP,
          mk: [{ type: 't', s: 0, e: EHolidayCommand.HELP.length }],
        },
        message,
      );
    }

    if (args[0] === 'delete') {
      if (!args[1]) return;
      await this.deleteHoliday(dateTime);
      return this.replyMessageGenerate(
        {
          messageContent: EHolidayCommand.DELETE,
        },
        message,
      );
    }
    await this.addHoliday(dateTime, messageHoliday);
    return this.replyMessageGenerate(
      {
        messageContent: EHolidayCommand.SAVE,
      },
      message,
    );
  }
}
