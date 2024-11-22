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
    if (
      hours < 11 ||
      (hours === 11 && minutes < 29) ||
      (hours === 12 && minutes > 0) ||
      hours > 12
    ) {
      return true;
    }
    return false;
  }

  @OnEvent(Events.StreamingJoinedEvent)
  async handleJoinNCC8(data: StreamingJoinedEvent) {
    try {
      const dateNow = Date.now();

      if (this.isOutsideTimeRangeNcc8(dateNow)) return; //check time ncc8

      const wfhResult = await this.timeSheetService.findWFHUser();
      const wfhUserEmail = wfhResult
        .filter((item) => ['Morning', 'Fullday'].includes(item.dateTypeName))
        .map((item) => {
          return getUserNameByEmail(item.emailAddress);
        });

      const findUserWfh = await this.userRepository.find({
        where: { username: In(wfhUserEmail), user_type: EUserType.MEZON },
      });

      const userIdList = findUserWfh.map((user) => user.userId);

      if (!userIdList.includes(data.user_id)) return; // check user wfh

      const findNcc8 = await this.mezonTrackerStreamingRepository.findOne({
        where: { id: data.id },
      });
      if (findNcc8) return;
      const dataInsert = new MezonTrackerStreaming();
      dataInsert.id = data.id;
      dataInsert.channelId = data.streaming_channel_id;
      dataInsert.clanId = data.clan_id;
      dataInsert.userId = data.user_id;
      dataInsert.joinAt = dateNow;
      await this.mezonTrackerStreamingRepository.save(dataInsert);
    } catch (error) {
      console.log('handleJoinNCC8', error);
    }
  }

  @OnEvent(Events.StreamingLeavedEvent)
  async handleLeaveNCC8(data: StreamingLeavedEvent) {
    try {
      const dateNow = Date.now();
      if (this.isOutsideTimeRangeNcc8(dateNow)) return;

      const findNcc8 = await this.mezonTrackerStreamingRepository.findOne({
        where: { id: data.id, userId: data.streaming_user_id },
      });
      if (!findNcc8) return;
      await this.mezonTrackerStreamingRepository.update(
        { id: findNcc8.id },
        { ...findNcc8, leaveAt: dateNow - 40000 },
      );
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
