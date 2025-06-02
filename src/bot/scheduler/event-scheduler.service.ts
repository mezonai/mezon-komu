import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { UtilsService } from '../services/utils.services';
import { ChannelMezon } from '../models/mezonChannel.entity';
import { ChannelType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { EMessageMode } from '../constants/configs';
import { KomuService } from '../services/komu.services';
import { MessageQueue } from '../services/messageQueue.service';
import { EventEntity } from '../models';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class EventSchedulerService {
  private client: MezonClient;
  constructor(
    private utilsService: UtilsService,
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
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

  private readonly logger = new Logger(EventSchedulerService.name);

  async getListVoiceChannelAvalable() {
    let listChannelVoiceUsers = [];
    try {
      const clan = await this.client.clans.fetch(this.clientConfig.clandNccId);
      listChannelVoiceUsers =
        (
          await clan.listChannelVoiceUsers(
            '',
            ChannelType.CHANNEL_TYPE_GMEET_VOICE,
          )
        )?.voice_channel_users ?? [];
    } catch (error) {
      // console.log('listChannelVoiceUsers event', error);
    }

    const listVoiceChannel = await this.channelRepository.find({
      where: {
        channel_type: In([4, 10]),
        clan_id: this.clientConfig.clandNccId,
      },
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
  async tagEvent() {
    this.logger.warn(
      `time ${CronExpression.EVERY_MINUTE} for job tagEvent to run!`,
    );
    if (await this.utilsService.checkHoliday()) return;

    const listVoiceChannelAvalable = await this.getListVoiceChannelAvalable();
    const repeatEventData = await this.getValidEvent();
    for (const dataEvent of repeatEventData) {
      const dateScheduler = new Date(+dataEvent.createdTimestamp);
      const minuteDb = dateScheduler.getMinutes();
      const dateCreatedTimestamp = new Date(
        +dataEvent.createdTimestamp.toString(),
      ).toLocaleDateString('en-US');

      if (
        !listVoiceChannelAvalable.length &&
        this.utilsService.isSameMinute(minuteDb, dateScheduler) &&
        this.utilsService.isSameDate(dateCreatedTimestamp)
      ) {
        const findChannel = await this.channelRepository.findOne({
          where: { channel_id: dataEvent.channelId },
        });
        const replyMessage = {
          clan_id: this.clientConfig.clandNccId,
          channel_id: dataEvent.channelId,
          is_public: findChannel ? !findChannel?.channel_private : false,
          is_parent_public: findChannel ? findChannel?.is_parent_public : true,
          parent_id: '0',
          mode: EMessageMode.CHANNEL_MESSAGE,
          msg: {
            t: 'Event: Voice channel full',
          },
        };
        this.messageQueue.addMessage(replyMessage);
      } else {
        await this.handleMeetingRepeat(
          dataEvent,
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
      await this.handleOnceEvent(
        data,
        listVoiceChannelAvalable,
        dateCreatedTimestamp,
        dateScheduler,
        minuteDb,
      );
    } catch (error) {
      console.log('event error', error);
    }
  }

  async sendEventMessage(data, listVoiceChannelAvalable, messageContent) {
    const listType10 = listVoiceChannelAvalable.filter(
      (item) => item.channel_type === 10,
    );
    const listType3 = listVoiceChannelAvalable.filter(
      (item) => item.channel_type === 4,
    );

    let selectedChannel = null;

    if (listType10.length > 0) {
      const randomIndex = Math.floor(Math.random() * listType10.length);
      selectedChannel = listType10[randomIndex];
    } else if (listType3.length > 0) {
      const randomIndex = Math.floor(Math.random() * listType3.length);
      selectedChannel = listType3[randomIndex];
    }
    const voiceChannel = await this.channelRepository.findOne({
      where: {
        channel_id: selectedChannel?.channel_id,
      },
    });
    const listUserId = data.users;
    listUserId.map((userId) => {
      const messageToUser: ReplyMezonMessage = {
        userId: userId,
        textContent:
          messageContent +
          (data?.attachment
            ? ` ${data?.attachment}`
            : `#${voiceChannel?.channel_label || ''}`),
        messOptions: !data?.attachment
          ? {
              hg: [
                {
                  channelid: selectedChannel?.channel_id,
                  s: messageContent.length,
                  e:
                    messageContent.length +
                    1 +
                    (voiceChannel?.channel_label || '').length,
                },
              ],
            }
          : {
              mk: [
                {
                  type: 'lk',
                  s: messageContent.length,
                  e: messageContent.length + data?.attachment.length + 1,
                },
              ],
            },
      };
      this.messageQueue.addMessage(messageToUser);
    });
  }

  async updateEventRepository(data, createdTimestamp?) {
    const updateData: any = {
      reminder: true,
    };

    if (createdTimestamp) {
      updateData.createdTimestamp = createdTimestamp;
    }
    try {
      await this.eventRepository
        .createQueryBuilder()
        .update(EventEntity)
        .set(updateData)
        .where('"id" = :id', { id: data.id })
        .execute();
    } catch (error) {
      console.log('updateEventRepository', error);
    }
  }

  async handleOnceEvent(
    data,
    listVoiceChannelAvalable,
    dateCreatedTimestamp,
    dateScheduler,
    minuteDb,
  ) {
    if (
      this.utilsService.isSameDate(dateCreatedTimestamp) &&
      this.utilsService.isSameMinute(minuteDb, dateScheduler)
    ) {
      const messageContent = `Please join the event ${data.title} at `;
      await this.sendEventMessage(
        data,
        listVoiceChannelAvalable,
        messageContent,
      );
      await this.updateEventRepository(data);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Ho_Chi_Minh' })
  async updateReminderEvent() {
    this.logger.warn(
      `time ${CronExpression.EVERY_MINUTE} for job updateReminderEvent to run!`,
    );
    if (await this.utilsService.checkHoliday()) return;
    const repeatEvent = await this.eventRepository.find({
      where: {
        reminder: true,
      },
    });
    const dateTimeNow = new Date();
    dateTimeNow.setHours(dateTimeNow.getHours());
    const hourDateNow = dateTimeNow.getHours();
    const minuteDateNow = dateTimeNow.getMinutes();
    repeatEvent.map(async (item) => {
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
        await this.eventRepository.update({ id: item.id }, { cancel: true });
      }
    });
  }

  async getValidEvent() {
    return await this.eventRepository
      .createQueryBuilder('event')
      .where(`"reminder" IS NOT TRUE`)
      .andWhere(`"cancel" IS NOT TRUE`)
      .select('event.*')
      .execute();
  }
}
