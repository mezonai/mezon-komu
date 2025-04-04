import { Injectable, Logger } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMessage } from 'mezon-sdk';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import moment from 'moment';
import { ReportDailyService } from 'src/bot/asterisk-commands/commands/report/reportDaily.service';
import { ReportWFHService } from 'src/bot/utils/report-wfh.serivce';
import { ReportTrackerService } from 'src/bot/services/reportTracker.sevicer';
import { google } from 'googleapis';
import { ExcelProcessor } from 'src/bot/utils/excel-processor';
import {
  getPreviousWorkingDay,
  handleDailyFine,
  handleMentionFine,
  handleTrackerFine,
  handleWFHFine,
} from 'src/bot/utils/daily-fine-report';
import { replyMessageGenerate } from 'src/bot/utils/generateReplyMessage';
import { EMessageMode } from 'src/bot/constants/configs';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { RoleMezon } from 'src/bot/models';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class FineReportSchedulerService {
  private readonly logger = new Logger(FineReportSchedulerService.name);
  constructor(
    private messageQueue: MessageQueue,
    private reportDailyService: ReportDailyService,
    private reportWFHService: ReportWFHService,
    private reportTrackerService: ReportTrackerService,
    private clientConfigService: ClientConfigService,
    @InjectRepository(RoleMezon)
    private roleMezonRepository: Repository<RoleMezon>,
  ) {}

  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_8AM, {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async dailyReportScheduler() {
    const data = await this.calculateAndUpdateSheet();

    const messageContent = `
    @STAFF @INTERN 
    Hi mn, link saodo ngày ${data.reportDate.format('DD/MM/YYYY')}. Mọi người lưu ý check kĩ các lỗi mình mắc phải, nếu cần complain thì gửi khiếu nại vào sheet saodo để được giải quyết nếu có lý do chính đáng.

    Link: ${data.sheetUrl}
    `
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();

    const roleTitles = ['STAFF', 'INTERN'];
    const roles = await this.roleMezonRepository.find({
      where: {
        clan_id: this.clientConfigService.clandNccId,
        title: In(roleTitles),
      },
    });
    const staffRole = roles.find((role) => role.title === 'STAFF');
    const internRole = roles.find((role) => role.title === 'INTERN');

    const replyMessage = {
      clan_id: this.clientConfigService.clandNccId,
      channel_id: this.clientConfigService.mezonNhaCuaChungChannelId,
      is_public: false,
      is_parent_public: true,
      parent_id: '0',
      mode: EMessageMode.CHANNEL_MESSAGE,
      msg: {
        t: messageContent,
        mk: [
          {
            type: 'lk',
            s: messageContent.length - data.sheetUrl.length,
            e: messageContent.length,
          },
        ],
      },
      mentions: [
        {
          role_id: staffRole?.id,
          s: 0,
          e: '@STAFF'.length,
        },
        {
          role_id: internRole?.id,
          s: '@STAFF'.length + 1,
          e: '@STAFF'.length + 1 + '@INTERN'.length,
        },
      ],
    };
    this.messageQueue.addMessage(replyMessage);
  }

  private async calculateAndUpdateSheet(
    reportDate?: moment.Moment,
    sheetId?: string,
  ) {
    try {
      const now = moment();

      if (!reportDate) {
        reportDate = getPreviousWorkingDay(now);
      }

      if (!sheetId) {
        sheetId = this.clientConfigService.sheetFineId;
      }

      const parsedDate = reportDate.startOf('day').toDate();
      const formatedDate = reportDate.format('DD/MM/YYYY');

      const [daily, mention, wfh, tracker] = await Promise.all([
        this.reportDailyService.getUserNotDaily(parsedDate),
        this.reportWFHService.reportMachleo(parsedDate),
        this.reportWFHService.reportWfh([, formatedDate], false),
        this.reportTrackerService.reportTrackerNot([, formatedDate], false),
      ]);

      const notDaily = daily?.notDaily;

      const oauth2Client = new google.auth.OAuth2(
        this.clientConfigService.sheetClientId,
        this.clientConfigService.sheetClientSecret,
      );
      oauth2Client.setCredentials({
        refresh_token: this.clientConfigService.sheetRefreshToken,
      });

      const sheets = google.sheets({
        version: 'v4',
        auth: oauth2Client,
      });

      const excelProcessor = new ExcelProcessor(reportDate, sheetId, sheets);
      await excelProcessor.initSheetData();

      handleDailyFine(notDaily, excelProcessor);
      handleMentionFine(mention, excelProcessor);
      handleWFHFine(wfh, excelProcessor);
      handleTrackerFine(tracker, excelProcessor);

      await excelProcessor.saveChange();

      return {
        reportDate,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
      };
    } catch (error) {
      this.logger.error('calculateAndUpdateSheet_error', error);
      throw error;
    }
  }

  async excuteReport(
    channelMessage: ChannelMessage,
    reportDate: moment.Moment,
    sheetId?: string,
  ) {
    if (reportDate.isSameOrAfter(moment(), 'day')) {
      return replyMessageGenerate(
        {
          messageContent: `Report the day before today: ${moment().format('DD/MM/YYYY')}!`,
        },
        channelMessage,
        true,
      );
    }

    const dayOfWeek = moment(reportDate).isoWeekday();

    if (dayOfWeek > 5) {
      return replyMessageGenerate(
        {
          messageContent: `${reportDate.format('DD/MM/YYYY')} is not a working day!`,
        },
        channelMessage,
        true,
      );
    }

    const { sheetUrl } = await this.calculateAndUpdateSheet(
      reportDate,
      sheetId,
    );

    const messageContent = `
      File saodo đã được cập nhật

      Link: ${sheetUrl}
      `
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();

    const messageData = replyMessageGenerate(
      {
        messageContent,
        mk: [
          {
            type: 'lk',
            s: messageContent.length - sheetUrl.length,
            e: messageContent.length,
          },
        ],
      },
      channelMessage,
      true,
    );

    return messageData;
  }
}
