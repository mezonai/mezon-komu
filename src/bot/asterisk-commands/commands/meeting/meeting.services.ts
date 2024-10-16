import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Meeting } from 'src/bot/models/meeting.entity';
import { VoiceChannels } from 'src/bot/models/voiceChannel.entity';
import { Repository } from 'typeorm';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { UtilsService } from 'src/bot/services/utils.services';

@Injectable()
export class MeetingService {
  constructor(
    private clientConfig: ClientConfigService,
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
    @InjectRepository(VoiceChannels)
    private readonly voiceChannelRepository: Repository<VoiceChannels>,
    private readonly utilsService: UtilsService,
  ) {}

  async getListCalender(channelId) {
    return await this.meetingRepository
      .createQueryBuilder('meeting')
      .where(`"channelId" = :channelId`, { channelId: channelId })
      .andWhere(`"cancel" IS NOT true`)
      .select(`meeting.*`)
      .execute();
  }

  async findStatusVoice() {
    const test = await this.voiceChannelRepository.findBy({ status: 'start' });
    return test;
  }

  async cancelMeetingById(id) {
    return await this.meetingRepository
      .createQueryBuilder('meeting')
      .update(Meeting)
      .set({
        cancel: true,
      })
      .where(`"id" = :id`, { id: id })
      .execute();
  }

  async cancelMeetingByChannelId(channelId) {
    return await this.meetingRepository
      .createQueryBuilder('meeting')
      .update(Meeting)
      .set({
        cancel: true,
      })
      .where(`"channelId" = :channelId`, { channelId: channelId })
      .execute();
  }

  validateRepeatTime(repeatTime) {
    return repeatTime.length === 0 || /^[0-9]+$/.test(repeatTime);
  }

  validateDate(checkDate) {
    const dateRegex =
      /^(((0[1-9]|[12]\d|3[01])\/(0[13578]|1[02])\/((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\/(0[13456789]|1[012])\/((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\/02\/((19|[2-9]\d)\d{2}))|(29\/02\/((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|(([1][26]|[2468][048]|[3579][26])00))))$/;
    return dateRegex.test(checkDate);
  }

  validateTime(checkTime) {
    const timeRegex = /(2[0-3]|[01][0-9]):[0-5][0-9]/;
    return timeRegex.test(checkTime);
  }

  validateRepeat(repeat) {
    const validRepeatValues = ['once', 'daily', 'weekly', 'repeat', 'monthly'];
    return validRepeatValues.includes(repeat);
  }

  async saveMeeting(channel_id, task, timestamp, repeat, repeatTime) {
    await this.meetingRepository.insert({
      channelId: channel_id,
      task: task,
      createdTimestamp: timestamp,
      repeat: repeat,
      repeatTime: repeatTime,
    });
  }

  async handleMeetingNoArgs(message) {
    const calendarChannel = message.channel_id;
    let list = await this.getListCalender(calendarChannel);

    let mess;
    if (!list || list.length === 0) {
      return '```✅ No scheduled meeting.```';
    }
    list = list.filter(
      (item) => item.repeat !== 'once' || item.createdTimestamp > Date.now(),
    );
    if (list.length === 0) {
      return '```✅ No scheduled meeting.```';
    }

    for (let i = 0; i <= Math.ceil(list.length / 50); i += 1) {
      if (list.slice(i * 50, (i + 1) * 50).length === 0) break;
      mess =
        '```' +
        'Calendar' +
        '\n' +
        list
          .slice(i * 50, (i + 1) * 50)
          .map((item) => {
            const dateTime = this.utilsService.formatDate(
              //formatDate
              new Date(Number(item.createdTimestamp)),
            );
            if (item.repeatTime) {
              return `- ${item.task} ${dateTime} (ID: ${item.id}) ${item.repeat} ${item.repeatTime}`;
            } else {
              return `- ${item.task} ${dateTime} (ID: ${item.id}) ${item.repeat}`;
            }
          })
          .join('\n') +
        '```';
      return mess;
    }
  }
}
