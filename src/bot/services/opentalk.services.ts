import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { VoiceSession } from '../models/voiceSession.entity';
import { VoiceJoinedEvent, VoiceLeavedEvent } from 'mezon-sdk';
import { isValid, parse } from 'date-fns';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class OpentalkService {
  private validChannelIds: string[];
  constructor(
    @InjectRepository(VoiceSession)
    private readonly sessionRepository: Repository<VoiceSession>,
  ) {}

  setValidChannelIds(validChannelIds: string[]) {
    this.validChannelIds = [...validChannelIds];
  }

  getValidChannelIds() {
    return this.validChannelIds;
  }

  removeAllValidChannelIds() {
    this.validChannelIds = [];
    return this.validChannelIds;
  }

  addValidChannelIds(id: string[]) {
    this.validChannelIds = [...this.validChannelIds, ...id];
    return this.validChannelIds;
  }

  removeValidChannelIds(id: string) {
    this.validChannelIds = this.validChannelIds.filter(
      (channelId) => channelId !== id,
    );
    return this.validChannelIds;
  }

  async handleVoiceJoined(event: VoiceJoinedEvent) {
    await this.sessionRepository.save({
      id: event.id,
      user_id: event.user_id,
      clan_id: event.clan_id,
      voice_channel_id: event.voice_channel_id,
      joined_at: new Date(),
    });
  }

  async handleVoiceLeaved(event: VoiceLeavedEvent) {
    await this.sessionRepository.update(
      { id: event.id },
      {
        left_at: new Date(),
      },
    );
  }

  async getAllUsersVoiceTime(
    clanId: string,
    dateStr: string,
  ): Promise<{ user_id: string; totalMinutes: number }[]> {
    const parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
    if (!isValid(parsed)) {
      throw new Error('Invalid date');
    }

    const start = new Date(
      Date.UTC(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        2, // 9 - 7 = 2 (UTC)
        30,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        5, // 12 - 7 = 5 (UTC)
        30,
        0,
        0,
      ),
    );
    const where: any = {
      clan_id: clanId,
      joined_at: MoreThanOrEqual(start),
      left_at: LessThanOrEqual(end),
    };

    if (this.validChannelIds?.length > 0) {
      where.voice_channel_id = In(this.validChannelIds);
    }

    const sessions = await this.sessionRepository.find({ where });
    const userMap = new Map<string, number>();

    for (const session of sessions) {
      if (!session.joined_at || !session.left_at) continue;

      const ms = session.left_at.getTime() - session.joined_at.getTime();
      if (ms > 0) {
        const prev = userMap.get(session.user_id) || 0;
        userMap.set(session.user_id, prev + ms);
      }
    }

    return Array.from(userMap.entries()).map(([user_id, totalMs]) => ({
      user_id,
      totalMinutes: Math.floor(totalMs / 60000),
    }));
  }

  @Cron('0 8 * * 1', { timeZone: 'Asia/Ho_Chi_Minh' })
  removeChannelValidsSchedule() {
    this.validChannelIds = [];
  }
}
