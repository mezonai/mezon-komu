import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, StreamingJoinedEvent, StreamingLeavedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MezonTrackerStreaming, RoleMezon, User } from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { TimeSheetService } from '../services/timesheet.services';
import { getUserNameByEmail } from '../utils/helper';
import { EUserType } from '../constants/configs';

@Injectable()
export class StreamingEvent extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(MezonTrackerStreaming)
    private mezonTrackerStreamingRepository: Repository<MezonTrackerStreaming>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private timeSheetService: TimeSheetService,
  ) {
    super(clientService);
  }

  isOutsideTimeRangeNcc8(dateNow) {
    const currentDate = new Date(dateNow);
    const hoursUTC = currentDate.getUTCHours();
    const minutesUTC = currentDate.getUTCMinutes();
    const hours = (hoursUTC + 7) % 24;
    const minutes = minutesUTC;

    const vietnamDate = new Date(currentDate.getTime() + 7 * 60 * 60 * 1000);
    const day = vietnamDate.getDay();

    if (day !== 5) return true;

    if (
      hours < 11 ||
      (hours === 11 && minutes < 25) ||
      (hours === 12 && minutes > 5) ||
      hours > 12
    ) {
      return true;
    }
    return false;
  }

  @OnEvent(Events.StreamingJoinedEvent)
  async handleJoinNCC8(data: StreamingJoinedEvent) {
    console.log('data joined', data);
    if (
      data.user_id === process.env.BOT_KOMU_ID ||
      data.streaming_channel_id !== process.env.MEZON_NCC8_CHANNEL_ID
    )
      return;
    try {
      const dateNow = Date.now();

      if (this.isOutsideTimeRangeNcc8(dateNow)) return; //check time ncc8
      const wfhResult = await this.timeSheetService.findWFHUser();
      const wfhUserEmail = wfhResult
        .filter((item) => ['Morning', 'Fullday'].includes(item.dateTypeName))
        .map((item) => {
          return getUserNameByEmail(item.emailAddress);
        });

      const findUserWfh = await this.userRepository
        .createQueryBuilder('user')
        .where(
          '(user.clan_nick IN (:...wfhUserEmail) OR user.username IN (:...wfhUserEmail))',
        )
        .andWhere('user.user_type = :userType')
        .setParameters({
          wfhUserEmail,
          userType: EUserType.MEZON,
        })
        .getMany();
      const userIdList = findUserWfh.map((user) => user.userId);

      const user = await this.client.users.fetch(data.user_id);
      user.sendDM({ t: "🎉 Joining NCC8 successfully. Let's chill with NCC8!" });
      if (!userIdList.includes(data.user_id)) return; // check user wfh

      const existing = await this.mezonTrackerStreamingRepository.findOne({
        where: {
          userId: data.user_id,
          channelId: data.streaming_channel_id,
          leaveAt: IsNull(),
        },
      });

      if (!existing) {
        const dataInsert = new MezonTrackerStreaming();
        dataInsert.id = data.id || `${data.user_id}-${dateNow}`;
        dataInsert.channelId = data.streaming_channel_id;
        dataInsert.clanId = data.clan_id;
        dataInsert.userId = data.user_id;
        dataInsert.joinAt = dateNow;
        await this.mezonTrackerStreamingRepository.save(dataInsert);
      } else {
        console.log(`User ${data.user_id} đã trong một session chưa đóng.`);
      }
    } catch (error) {
      console.error('handleJoinNCC8 error:', error);
    }
  }

  @OnEvent(Events.StreamingLeavedEvent)
  async handleLeaveNCC8(data: StreamingLeavedEvent) {
    console.log('handleLeaveNCC8', data);
    if (
      data.streaming_user_id === process.env.BOT_KOMU_ID ||
      data.streaming_channel_id !== process.env.MEZON_NCC8_CHANNEL_ID
    )
      return;
    try {
      const dateNow = Date.now();
      if (this.isOutsideTimeRangeNcc8(dateNow)) return;

      const existing = await this.mezonTrackerStreamingRepository.findOne({
        where: {
          userId: data.streaming_user_id,
          channelId: data.streaming_channel_id,
          leaveAt: null,
        },
        order: { joinAt: 'DESC' },
      });
      if (existing) {
        existing.leaveAt = dateNow;
        await this.mezonTrackerStreamingRepository.save(existing);
        console.log(`Session của user ${data.streaming_user_id} đã được đóng.`);
      } else {
        console.warn(
          `Không tìm thấy session đang mở cho user ${data.streaming_user_id}.`,
        );
      }
      const user = await this.client.users.fetch(data.streaming_user_id);
      user.sendDM({ t: '❗Bạn đã rời khỏi channel NCC8-Radio!' });
    } catch (error) {
      console.log('handleLeaveNCC8', error);
    }
  }

  @Cron('1 12 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleAutoFillTimeLeave() {
    try {
      const dateNow = Date.now();
      await this.mezonTrackerStreamingRepository.update(
        { leaveAt: IsNull() },
        { leaveAt: dateNow - 40000 },
      );
    } catch (error) {
      console.log('handleAutoFillTimeLeave', error);
    }
  }
}
