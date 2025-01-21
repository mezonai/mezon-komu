import { ChannelMessage, EButtonMessageStyle } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import {
  EMessageComponentType,
  MEZON_EMBED_FOOTER, StatusTimeSheet,
} from 'src/bot/constants/configs';
import { generateEmail, getRandomColor } from 'src/bot/utils/helper';
import { InjectRepository } from '@nestjs/typeorm';
import { User, AbsenceDayRequest } from '../../../models';
import { TimeSheetService } from '../../../services/timesheet.services';
import { Repository } from 'typeorm';
import { MezonClientService } from '../../../../mezon/services/client.service';
import { getFormattedDate, getWeekRange, convertWorkingTimeToHours, handleTypeOfWork } from './submitweekts.functions';

@Command('ts')
export class SubmitWeekTsCommand extends CommandMessage {
  constructor(
    private clientService: MezonClientService,
    private timeSheetService: TimeSheetService,
    @InjectRepository(AbsenceDayRequest)
    private absenceDayRequestRepository: Repository<AbsenceDayRequest>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const onlySubmitSyntax =
      message?.content?.t && typeof message.content.t === 'string'
        ? message.content.t.trim() === '*ts submit'
        : false;
    if (!onlySubmitSyntax) {
      return;
    }
    const messageid = message.message_id;
    const clanId = message.clan_id;
    const codeMess = message.code;
    const modeMess = message.mode;
    const isPublic = message.is_public;
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

    const getDayOfWeek = getWeekRange();

    const timeSheets = await this.timeSheetService.getAllTimeSheetOfUser(getDayOfWeek.startOfWeek, getDayOfWeek.endOfWeek, emailAddress);
    const sortedTimeSheets = timeSheets.sort(
      (a, b) => new Date(a.dateAt).getTime() - new Date(b.dateAt).getTime(),
    );

    let content = '';
    for (let i = 0; i < sortedTimeSheets.length; i++) {
      const timesheet = sortedTimeSheets[i];
      const dateFormat = getFormattedDate(timesheet.dateAt);
      const projectTargetUser = timesheet.projectTargetUser ? timesheet.projectTargetUser : '';
      const workingTimeTargetUser = timesheet.workingTimeTargetUser ? timesheet.workingTimeTargetUser : '';
      const status = StatusTimeSheet[timesheet.status];

      const timesheetPrev = sortedTimeSheets[i - 1];
      if (timesheetPrev && timesheetPrev.dateAt !== timesheet.dateAt) {
        content += '---------------------------------------------------------\n';
      }
      content += ('+ ' + dateFormat + ': ' + timesheet.projectName + ' - ' + status + ' - ' + timesheet.taskName + ' - ' + convertWorkingTimeToHours(timesheet.workingTime) + 'h - ' + handleTypeOfWork(timesheet.typeOfWork) + ' - ' + (projectTargetUser ? ('[' + projectTargetUser + ' - ') : '') + (workingTimeTargetUser ? (convertWorkingTimeToHours(workingTimeTargetUser) + 'h]' + ' - ') : '') + timesheet.note + '\n');
    }

    const embed = [
      {
        color: getRandomColor(),
        title: `Submit timesheet for the week starting ${getDayOfWeek.startOfWeek} to ${getDayOfWeek.endOfWeek}`,
        description:
          '```' +
          `${content}` +
          '```',
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const components = [
      {
        components: [
          {
            id: `submitWeekTs_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_${senderId}_${getDayOfWeek.startOfWeek}_${getDayOfWeek.endOfWeek}_CANCEL`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `submitWeekTs_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_${senderId}_${getDayOfWeek.startOfWeek}_${getDayOfWeek.endOfWeek}_CONFIRM`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Submit`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ];

    const dataSend = this.replyMessageGenerate(
      {
        embed,
        components,
      },
      message,
    );
    return await this.clientService.sendMessage(dataSend);
  }
}
