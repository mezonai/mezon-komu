import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { VoiceSession } from '../models/voiceSession.entity';
import { VoiceJoinedEvent, VoiceLeavedEvent } from 'mezon-sdk';
import { isValid, parse } from 'date-fns';
import { Cron } from '@nestjs/schedule';
import { User } from '../models';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export enum UpdateTimeType {
  DOWN = 'down',
  UP = 'up',
}

@Injectable()
export class OpentalkService {
  private validChannelIds: string[];
  private readonly channelIdsFile = join(
    __dirname,
    '..',
    '..',
    'data',
    'validChannelIds.json',
  );
  constructor(
    @InjectRepository(VoiceSession)
    private readonly sessionRepository: Repository<VoiceSession>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.loadValidChannelIdsFromFile();
  }

  saveValidChannelIdsToFile() {
    const dir = dirname(this.channelIdsFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(
      this.channelIdsFile,
      JSON.stringify(this.validChannelIds, null, 2),
      'utf8',
    );
  }

  loadValidChannelIdsFromFile() {
    if (existsSync(this.channelIdsFile)) {
      const data = readFileSync(this.channelIdsFile, 'utf8');
      this.validChannelIds = JSON.parse(data);
    } else {
      this.validChannelIds = [];
    }
  }

  setValidChannelIds(validChannelIds: string[]) {
    this.validChannelIds = [...validChannelIds];
  }

  getValidChannelIds() {
    return this.validChannelIds;
  }

  removeAllValidChannelIds() {
    this.validChannelIds = [];
    this.saveValidChannelIdsToFile();
    return this.validChannelIds;
  }

  addValidChannelIds(id: string[]) {
    this.validChannelIds = [...this.validChannelIds, ...id];
    this.saveValidChannelIdsToFile();
    return this.validChannelIds;
  }

  removeValidChannelIds(id: string) {
    this.validChannelIds = this.validChannelIds.filter(
      (channelId) => channelId !== id,
    );
    this.saveValidChannelIdsToFile();
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
    dateStr: string,
    clanId: string = process.env.KOMUBOTREST_CLAN_NCC_ID!,
  ) {
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
        16, // 12 - 7 = 5 (UTC)
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

    const result: {
      user_id: string;
      email: string;
      totalTime: number;
      date: string;
    }[] = [];

    for (const [user_id, totalMs] of userMap.entries()) {
      const user = await this.userRepository.findOne({
        where: { userId: user_id },
      });
      if (!user) continue;
      result.push({
        user_id,
        email: user.clan_nick || user.username,
        totalTime: Math.floor(totalMs / 60000),
        date: dateStr,
      });
    }
    
    return result;
  }

  async updateLeftAt(userId: string, min: number, type: UpdateTimeType) {
    const latestSession = await this.sessionRepository.findOne({
      where: {
        user_id: userId,
        left_at: Not(IsNull()),
      },
      order: {
        left_at: 'DESC',
      },
    });

    if (!latestSession) return;

    const direction = type === UpdateTimeType.DOWN ? -1 : 1;

    latestSession.left_at = new Date(
      latestSession.left_at.getTime() + direction * min * 60 * 1000,
    );

    await this.sessionRepository.save(latestSession);
  }

  @Cron('0 8 * * 1', { timeZone: 'Asia/Ho_Chi_Minh' })
  removeChannelValidsSchedule() {
    this.validChannelIds = [];
    this.saveValidChannelIdsToFile();
  }
}
