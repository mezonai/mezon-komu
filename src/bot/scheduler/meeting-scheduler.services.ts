import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronExpression, Cron } from '@nestjs/schedule';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { isFirstDayOfMonth, isLastDayOfMonth } from 'date-fns';
import { Meeting } from '../models/meeting.entity';
import { UtilsService } from '../services/utils.services';
import { ChannelMezon } from '../models/mezonChannel.entity';
import { ChannelType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { EMessageMode } from '../constants/configs';
import { KomuService } from '../services/komu.services';
import { MessageQueue } from '../services/messageQueue.service';

@Injectable()
export class MeetingSchedulerService {
  private client: MezonClient;
  constructor(
    private utilsService: UtilsService,
    @InjectRepository(Meeting)
    private meetingRepository: Repository<Meeting>,
    private configClient: ClientConfigService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    private clientConfig: ClientConfigService,
    private clientService: MezonClientService,
    private komuService: KomuService,
    private messageQueue: MessageQueue,
  ) {
    this.client = this.clientService.getClient();
  }

  private readonly logger = new Logger(MeetingSchedulerService.name);

  async getListVoiceChannelAvalable() {
    let listChannelVoiceUsers = [];
    try {
      listChannelVoiceUsers =
        (
          await this.client.listChannelVoiceUsers(
            this.clientConfig.clandNccId,
            '',
            ChannelType.CHANNEL_TYPE_VOICE,
          )
        )?.voice_channel_users ?? [];
    } catch (error) {
      console.log('listChannelVoiceUsers', error);
    }

    const listVoiceChannel = await this.channelRepository.find({
      where: { channel_type: ChannelType.CHANNEL_TYPE_VOICE },
    });
    const listVoiceChannelIdUsed = [];
    listChannelVoiceUsers.forEach((item) => {
      if (!listVoiceChannelIdUsed.includes(item.channel_id))
        listVoiceChannelIdUsed.push(item.channel_id);
    });
    const listVoiceChannelAvalable = listVoiceChannel.filter(
      (item) => !listVoiceChannelIdUsed.includes(item.channel_id),
    );
    return listVoiceChannelAvalable;
  }

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Ho_Chi_Minh' })
  async tagMeeting() {
    this.logger.warn(
      `time ${CronExpression.EVERY_MINUTE} for job tagMeeting to run!`,
    );
    if (await this.utilsService.checkHoliday()) return;

    const listVoiceChannelAvalable = await this.getListVoiceChannelAvalable();
    const repeatMeetingData = await this.getValidMeetings();
    for (const dataMeeing of repeatMeetingData) {
      const dateScheduler = new Date(+dataMeeing.createdTimestamp);
      const minuteDb = dateScheduler.getMinutes();
      const dateCreatedTimestamp = new Date(
        +dataMeeing.createdTimestamp.toString(),
      ).toLocaleDateString('en-US');

      if (
        !listVoiceChannelAvalable.length &&
        this.utilsService.isSameMinute(minuteDb, dateScheduler) &&
        this.utilsService.isSameDate(dateCreatedTimestamp)
      ) {
        const findChannel = await this.channelRepository.findOne({
          where: { channel_id: dataMeeing.channelId },
        });
        const replyMessage = {
          clan_id: this.clientConfig.clandNccId,
          channel_id: dataMeeing.channelId,
          is_public: findChannel ? !findChannel?.channel_private : false,
          is_parent_public: findChannel ? findChannel?.is_parent_public : true,
          parent_id: '0',
          mode: EMessageMode.CHANNEL_MESSAGE,
          msg: {
            t: 'Voice channel full',
          },
        };
        this.messageQueue.addMessage(replyMessage);
      } else {
        await this.handleMeetingRepeat(
          dataMeeing,
          listVoiceChannelAvalable,
          dateCreatedTimestamp,
          dateScheduler,
          minuteDb,
        );
      }
    }
  }

  async handleMeetingRepeat(
    data,
    listVoiceChannelAvalable,
    dateCreatedTimestamp,
    dateScheduler,
    minuteDb,
  ) {
    try {
      const newDateTimestamp = new Date(+data.createdTimestamp.toString());
      const currentDate = new Date(newDateTimestamp.getTime());
      const today = new Date();
      currentDate.setDate(today.getDate());
      currentDate.setMonth(today.getMonth());
      switch (data.repeat) {
        case 'once':
          await this.handleOnceMeeting(
            data,
            listVoiceChannelAvalable,
            dateCreatedTimestamp,
            dateScheduler,
            minuteDb,
          );
          break;
        case 'daily':
          await this.handleDailyMeeting(
            data,
            listVoiceChannelAvalable,
            currentDate,
            dateScheduler,
            minuteDb,
          );
          break;
        case 'weekly':
          await this.handleWeeklyMeeting(
            data,
            listVoiceChannelAvalable,
            currentDate,
            dateScheduler,
            minuteDb,
          );
          break;
        case 'repeat':
          await this.handleRepeatMeeting(
            data,
            listVoiceChannelAvalable,
            currentDate,
            dateScheduler,
            minuteDb,
          );
          break;
        case 'monthly':
          await this.handleMonthlyMeeting(
            data,
            listVoiceChannelAvalable,
            today,
            dateScheduler,
            minuteDb,
          );
          break;
        default:
          break;
      }
    } catch (error) {
      console.log('meeting error', error);
    }
  }

  async sendMeetingMessage(data, listVoiceChannelAvalable, messageContent) {
    const randomIndexVoiceChannel = Math.floor(
      Math.random() * listVoiceChannelAvalable.length,
    );
    const findChannel = await this.channelRepository.findOne({
      where: { channel_id: data.channelId },
    });
    const replyMessage = {
      clan_id: this.clientConfig.clandNccId,
      channel_id: data.channelId,
      is_public: findChannel ? !findChannel?.channel_private : false,
      is_parent_public: findChannel ? findChannel?.is_parent_public : true,
      parent_id: '0',
      mode: EMessageMode.CHANNEL_MESSAGE,
      msg: {
        t: messageContent + `# (${data?.task ?? ''})`,
        hg: [
          {
            channelid:
              listVoiceChannelAvalable[randomIndexVoiceChannel].channel_id,
            s: messageContent.length,
            e: messageContent.length + 1,
          },
        ],
      },
      mentions: [{ user_id: this.configClient.hereUserId, s: 0, e: 5 }],
    };
    this.messageQueue.addMessage(replyMessage);
  }

  async updateMeetingRepository(data, createdTimestamp?) {
    const updateData: any = {
      reminder: true,
    };

    if (createdTimestamp) {
      updateData.createdTimestamp = createdTimestamp;
    }
    try {
      await this.meetingRepository
        .createQueryBuilder()
        .update(Meeting)
        .set(updateData)
        .where('"id" = :id', { id: data.id })
        .execute();
    } catch (error) {
      console.log('updateMeetingRepository', error);
    }
  }

  async handleOnceMeeting(
    data,
    listVoiceChannelAvalable,
    dateCreatedTimestamp,
    dateScheduler,
    minuteDb,
  ) {
    // console.log('datadatadata', data);
    if (
      this.utilsService.isSameDate(dateCreatedTimestamp) &&
      this.utilsService.isSameMinute(minuteDb, dateScheduler)
    ) {
      const messageContent = `@here Our meeting room is `;
      await this.sendMeetingMessage(
        data,
        listVoiceChannelAvalable,
        messageContent,
      );
      await this.updateMeetingRepository(data);
    }
  }

  async handleDailyMeeting(
    data,
    listVoiceChannelAvalable,
    currentDate,
    dateScheduler,
    minuteDb,
  ) {
    if (this.utilsService.isSameDay()) return;
    if (
      this.utilsService.isSameMinute(
        minuteDb,
        dateScheduler,
        data.channel_id,
      ) &&
      this.utilsService.isTimeDay(dateScheduler, data.channel_id)
    ) {
      const messageContent = `@here Our meeting room is `;
      await this.sendMeetingMessage(
        data,
        listVoiceChannelAvalable,
        messageContent,
      );

      let newCreatedTimestamp = data.createdTimestamp;
      newCreatedTimestamp = currentDate.setDate(currentDate.getDate() + 1);
      while (await this.utilsService.checkHolidayMeeting(currentDate)) {
        newCreatedTimestamp = currentDate.setDate(currentDate.getDate() + 1);
      }
      await this.updateMeetingRepository(data, newCreatedTimestamp);
    }
  }

  async handleWeeklyMeeting(
    data,
    listVoiceChannelAvalable,
    currentDate,
    dateScheduler,
    minuteDb,
  ) {
    if (
      this.utilsService.isSameMinute(minuteDb, dateScheduler) &&
      this.utilsService.isDiffDay(dateScheduler, 7) &&
      this.utilsService.isTimeDay(dateScheduler)
    ) {
      const messageContent = `@here Our meeting room is `;
      await this.sendMeetingMessage(
        data,
        listVoiceChannelAvalable,
        messageContent,
      );

      let newCreatedTimestampWeekly = data.createdTimestamp;
      newCreatedTimestampWeekly = currentDate.setDate(
        currentDate.getDate() + 7,
      );
      while (await this.utilsService.checkHolidayMeeting(currentDate)) {
        newCreatedTimestampWeekly = currentDate.setDate(
          currentDate.getDate() + 7,
        );
      }
      await this.updateMeetingRepository(data, newCreatedTimestampWeekly);
    }
  }

  async handleRepeatMeeting(
    data,
    listVoiceChannelAvalable,
    currentDate,
    dateScheduler,
    minuteDb,
  ) {
    if (
      this.utilsService.isSameMinute(minuteDb, dateScheduler) &&
      this.utilsService.isDiffDay(dateScheduler, +data.repeatTime) &&
      this.utilsService.isTimeDay(dateScheduler)
    ) {
      const messageContent = `@here Our meeting room is `;
      await this.sendMeetingMessage(
        data,
        listVoiceChannelAvalable,
        messageContent,
      );

      let newCreatedTimestampRepeat = data.createdTimestamp;
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + +data.repeatTime);
      newCreatedTimestampRepeat = newDate.getTime();
      while (await this.utilsService.checkHolidayMeeting(currentDate)) {
        newCreatedTimestampRepeat = newDate.setDate(
          newDate.getDate() + +data.repeatTime,
        );
      }
      await this.updateMeetingRepository(data, newCreatedTimestampRepeat);
    }
  }

  async handleMonthlyMeeting(
    data,
    listVoiceChannelAvalable,
    today,
    dateScheduler,
    minuteDb,
  ) {
    if (this.utilsService.isSameDay()) {
      return;
    }

    if (
      this.utilsService.isSameMinute(minuteDb, dateScheduler) &&
      this.utilsService.isTimeDay(dateScheduler)
    ) {
      const isRepeatFirst = data.repeatTime === 'first';
      const isRepeatLast = data.repeatTime === 'last';
      const isRepeatMonthly = !isRepeatFirst && !isRepeatLast;

      today.setHours(today.getHours() + 7);
      const isCurrentMonthFirstDay = isFirstDayOfMonth(today);
      const isCurrentMonthLastDay = isLastDayOfMonth(today);
      const isCurrentDateScheduler =
        today.getDate() === dateScheduler.getDate();

      if (
        (isRepeatFirst && isCurrentMonthFirstDay) ||
        (isRepeatLast && isCurrentMonthLastDay) ||
        (isRepeatMonthly && isCurrentDateScheduler)
      ) {
        const messageContent = `@here Our meeting room is `;
        await this.sendMeetingMessage(
          data,
          listVoiceChannelAvalable,
          messageContent,
        );
        await this.updateMeetingRepository(data);
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Ho_Chi_Minh' })
  async updateReminderMeeting() {
    this.logger.warn(
      `time ${CronExpression.EVERY_MINUTE} for job updateReminderMeeting to run!`,
    );
    if (await this.utilsService.checkHoliday()) return;
    const repeatMeet = await this.meetingRepository.find({
      where: {
        reminder: true,
      },
    });

    const dateTimeNow = new Date();
    dateTimeNow.setHours(dateTimeNow.getHours());
    const hourDateNow = dateTimeNow.getHours();
    const minuteDateNow = dateTimeNow.getMinutes();

    repeatMeet.map(async (item) => {
      let checkFiveMinute;
      let hourTimestamp;
      const dateScheduler = new Date(+item.createdTimestamp);

      const minuteDb = dateScheduler.getMinutes();
      if (minuteDb >= 0 && minuteDb <= 4) {
        checkFiveMinute = minuteDb + 60 - minuteDateNow;
        const hourDb = dateScheduler;
        const setHourTimestamp = hourDb.setHours(hourDb.getHours() - 1);
        hourTimestamp = new Date(setHourTimestamp).getHours();
      } else {
        checkFiveMinute = minuteDateNow - minuteDb;
        hourTimestamp = dateScheduler.getHours();
      }
      if (hourDateNow === hourTimestamp && checkFiveMinute > 1) {
        if (item.repeat === 'once') {
          await this.meetingRepository.update(
            { id: item.id },
            { cancel: true },
          );
        } else {
          await this.meetingRepository.update(
            { id: item.id },
            { reminder: false },
          );
        }
      }
    });
  }

  async getValidMeetings() {
    return await this.meetingRepository
      .createQueryBuilder('meeting')
      .where(`"reminder" IS NOT TRUE`)
      .andWhere(`"cancel" IS NOT TRUE`)
      .select('meeting.*')
      .execute();
  }
}
