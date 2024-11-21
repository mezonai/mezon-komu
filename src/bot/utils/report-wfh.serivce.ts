import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WorkFromHome } from 'src/bot/models/wfh.entity';
import { Repository } from 'typeorm';
import { UtilsService } from '../services/utils.services';

@Injectable()
export class ReportWFHService {
  constructor(
    @InjectRepository(WorkFromHome)
    private wfhRepository: Repository<WorkFromHome>,
    private utilsService: UtilsService,
  ) {}

  async reportWfh(message, args) {
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

    const wfhFullday = await this.wfhRepository
      .createQueryBuilder('wfh')
      .innerJoinAndSelect('komu_user', 'm', 'wfh.userId = m.userId')
      .where(
        '("status" = :statusACCEPT AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay) OR ("status" = :statusACTIVE AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay) OR ("status" = :statusAPPROVED AND pmconfirm = :pmconfirm AND "type" = :type AND wfh.createdAt >= :firstDay AND wfh.createdAt <= :lastDay)',
        {
          type: 'wfh',
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
      .groupBy('m.username')
      .addGroupBy('wfh.userId')
      .select('wfh.userId, COUNT(wfh.userId) as total, m.username')
      .orderBy('total', 'DESC')
      .execute();

    let mess;
    if (!wfhFullday) {
      return;
    } else if (Array.isArray(wfhFullday) && wfhFullday.length === 0) {
      mess = ['```' + 'Không có ai vi phạm trong ngày' + '```'];
      return mess;
    } else {
      const listMessage = [];
      for (let i = 0; i <= Math.ceil(wfhFullday.length / 50); i += 1) {
        if (wfhFullday.slice(i * 50, (i + 1) * 50).length === 0) break;
        mess = wfhFullday
          .slice(i * 50, (i + 1) * 50)
          .map((wfh) => `${wfh.username} - (${wfh.total})`)
          .join('\n');
        listMessage.push(
          'Những người bị phạt vì không trả lời wfh trong ngày hôm nay' +
            '\n' +
            `${mess}`,
        );
      }
      return listMessage;
    }
  }

  // async reportCompalinWfh(message, args, client) {
  //   let authorId = message.author.id;
  //   let fomatDate;
  //   if (args[2]) {
  //     const day = args[2].slice(0, 2);
  //     const month = args[2].slice(3, 5);
  //     const year = args[2].slice(6);

  //     fomatDate = `${month}/${day}/${year}`;
  //   } else {
  //     fomatDate = new Date().toLocaleDateString("en-US", {
  //       year: "numeric",
  //       month: "2-digit",
  //       day: "2-digit",
  //     });
  //   }

  //   const wfhFullday = await this.wfhRepository
  //     .createQueryBuilder("wfh")
  //     .where(`"status" = :status`, { status: "APPROVED" })
  //     .andWhere(`"complain" = :complain`, { complain: true })
  //     .andWhere(
  //       `wfh.createdAt > ${this.utilsService
  //         .getTimeToDay(fomatDate)
  //         .firstDay.getTime()}`
  //     )
  //     .andWhere(
  //       `wfh.createdAt < ${this.utilsService
  //         .getTimeToDay(fomatDate)
  //         .lastDay.getTime()}`
  //     )
  //     .select("*")
  //     .execute();

  //   let mess;
  //   if (!wfhFullday) {
  //     return;
  //   } else if (Array.isArray(wfhFullday) && wfhFullday.length === 0) {
  //     mess = "```" + "Không có ai được approved trong ngày" + "```";
  //     return message.reply(mess).catch((err) => {
  //       this.komubotrestService.sendErrorToDevTest(client, authorId, err);
  //     });
  //   } else {
  //     for (let i = 0; i <= Math.ceil(wfhFullday.length / 50); i += 1) {
  //       if (wfhFullday.slice(i * 50, (i + 1) * 50).length === 0) break;
  //       mess = wfhFullday
  //         .slice(i * 50, (i + 1) * 50)
  //         .map((wfh) => `<@${wfh.userId}>`)
  //         .join("\n");
  //       const Embed = new EmbedBuilder()
  //         .setTitle("Những người được approved trong ngày hôm nay")
  //         .setColor("Red")
  //         .setDescription(`${mess}`);
  //       return message.reply({ embeds: [Embed] }).catch((err) => {
  //         this.komubotrestService.sendErrorToDevTest(client, authorId, err);
  //       });
  //     }
  //   }
  // }

  async reportMachleo(date: Date) {
    const formatDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const result = await this.wfhRepository
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
      .select('m.email, COUNT(wfh.userId) as count')
      .orderBy('count', 'DESC')
      .execute();
    return result;
  }
}
