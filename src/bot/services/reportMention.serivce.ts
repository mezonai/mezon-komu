import { InjectRepository } from '@nestjs/typeorm';
import { WorkFromHome } from 'src/bot/models/wfh.entity';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import moment from 'moment';
import { UtilsService } from './utils.services';
import { TimeSheetService } from './timesheet.services';

@Injectable()
export class ReportMentionService {
  constructor(
    @InjectRepository(WorkFromHome)
    private wfhRepository: Repository<WorkFromHome>,
    private utilsService: UtilsService,
    private timeSheetService: TimeSheetService,
  ) {}

  async reportMention(message, args) {
    let formatDate;
    if (args[1]) {
      const day = args[1].slice(0, 2);
      const month = args[1].slice(3, 5);
      const year = args[1].slice(6);

      formatDate = `${month}/${day}/${year}`;
    } else {
      formatDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    const mentionFullday = await this.wfhRepository
      .createQueryBuilder('wfh')
      .innerJoinAndSelect('komu_user', 'm', 'wfh.userId = m.userId')
      .where(
        '("status" = :statusACCEPT AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay) OR ("status" = :statusACTIVE AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay) OR ("status" = :statusAPPROVED AND pmconfirm = :pmconfirm AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay)',
        {
          type: 'mention',
          statusACCEPT: 'ACCEPT',
          statusACTIVE: 'ACTIVE',
          statusAPPROVED: 'APPROVED',
          pmconfirm: false,
          firstDay: this.utilsService
            .getTimeToDayMention(formatDate)
            .firstDay.getTime(),
          lastDay: this.utilsService
            .getTimeToDayMention(formatDate)
            .lastDay.getTime(),
        },
      )
      .groupBy('m.email')
      .addGroupBy('wfh.userId')
      .select('wfh.userId, COUNT(wfh.userId) as total, m.email')
      .orderBy('total', 'DESC')
      .execute();

    let mess;
    const offUsers = await this.timeSheetService.getUserOffWork(
      moment(formatDate, 'MM/DD/YYYY').toDate(),
    );
    if (!mentionFullday) {
      return [];
    } else if (Array.isArray(mentionFullday) && mentionFullday.length === 0) {
      mess = [
        'Không có ai vi phạm trong ngày ' +
          moment(formatDate, 'MM/DD/YYYY').format('DD/MM/YYYY'),
      ];
      return mess;
    } else {
      const punishUsers = mentionFullday.reduce((result, user) => {
        if (
          offUsers.userOffAfternoon.find((offUser) => offUser === user.email)
        ) {
          user.userOffAffternoon = true;
        }

        if (offUsers.userOffMorning.find((offUser) => offUser === user.email)) {
          user.userOffMorning = true;
        }

        if (
          !offUsers.userOffFullday.find((offUser) => offUser === user.email)
        ) {
          result.push(user);
        }
        return result;
      }, []);

      const listMessage = [];

      for (let i = 0; i <= Math.ceil(punishUsers.length / 50); i += 1) {
        if (punishUsers.slice(i * 50, (i + 1) * 50).length === 0) break;
        mess = punishUsers
          .slice(i * 50, (i + 1) * 50)
          .map(
            (mention) =>
              `${mention.email} (${mention.total}) ${mention.userOffMorning ? '(Off morning)' : mention.userOffAffternoon ? '(Off afternoon)' : ''}`,
          )
          .join('\n');
        const textTitle = `Những người không trả lời mention trong ngày ${moment(formatDate, 'MM/DD/YYYY').format('DD/MM/YYYY')}\n`;
        listMessage.push(textTitle + mess);
      }
      return listMessage;
    }
  }
}
