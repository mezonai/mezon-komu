import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, Not } from 'typeorm';
import { randomUUID } from 'crypto';
import { EventMezon, User, VoiceSession } from '../models';
import { Cron } from '@nestjs/schedule';
import { endOfDay, format, parse, startOfDay } from 'date-fns';
import { VoiceUsersCacheService } from './voiceUserCache.services';
import { EMarkdownType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { UpdateTimeType } from './opentalk.services';

@Injectable()
export class VoiceSessionTrackingService {
  private readonly logger = new Logger(VoiceSessionTrackingService.name);
  private client: MezonClient;

  constructor(
    @InjectRepository(EventMezon)
    private readonly eventRepo: Repository<EventMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(VoiceSession)
    private readonly voiceSessionRepo: Repository<VoiceSession>,
    private voiceUsersCacheService: VoiceUsersCacheService,
    private clientService: MezonClientService,
  ) {
    this.client = this.clientService.getClient();
  }

  private async findActiveEventByVoiceChannel(
    voiceChannelId: string,
    nowMs: number,
  ) {
    const EARLY_JOIN_MS = 10 * 60 * 1000;
    return this.eventRepo
      .createQueryBuilder('e')
      .where('e.channelVoiceId = :vcid', { vcid: voiceChannelId })
      .andWhere('e.timeStart IS NOT NULL')
      .andWhere('e.active IS TRUE')
      .andWhere(':now >= (e.timeStart - :early)', {
        now: nowMs,
        early: EARLY_JOIN_MS,
      })
      .andWhere('(e.timeEnd IS NULL OR :now <= e.timeEnd)', { now: nowMs })
      .orderBy('e.timeStart', 'DESC')
      .getOne();
  }

  async onVoiceJoined(payload: {
    clan_id: string;
    user_id: string;
    participant?: string;
    voice_channel_id: string;
  }) {
    const now = new Date();

    const event = await this.findActiveEventByVoiceChannel(
      payload.voice_channel_id,
      now.getTime(),
    );
    console.log('event', event);
    if (!event) return;
    const open = await this.voiceSessionRepo.findOne({
      where: {
        user_id: payload.user_id,
        clan_id: payload.clan_id,
        voice_channel_id: payload.voice_channel_id,
        event_id: event.id,
        left_at: IsNull(),
      } as any,
      order: { joined_at: 'DESC' as any },
    });

    if (open) return;

    const joinedAtMs = Math.max(now.getTime(), Number(event.timeStart ?? 0));

    const session = this.voiceSessionRepo.create({
      id: randomUUID(),
      user_id: payload.user_id,
      clan_id: payload.clan_id,
      voice_channel_id: payload.voice_channel_id,
      joined_at: new Date(joinedAtMs),
      left_at: null,
      event_id: event.id,
      is_in_event: true,
    } as any);

    await this.voiceSessionRepo.save(session);
    const user = await this.client.users.fetch(payload.user_id);
    const text = `✅ Bạn vừa tham gia event: ${event.title} - ${event.description}!`;
    await user.sendDM({
      t: text,
      mk: [{ type: EMarkdownType.PRE, s: 0, e: text.length }],
    });
  }

  async onVoiceLeft(payload: {
    clan_id: string;
    voice_channel_id: string;
    voice_user_id: string;
  }) {
    const now = new Date();
    const open = await this.voiceSessionRepo.findOne({
      where: {
        user_id: payload.voice_user_id,
        clan_id: payload.clan_id,
        voice_channel_id: payload.voice_channel_id,
        left_at: IsNull(),
      } as any,
      order: { joined_at: 'DESC' as any },
    });

    if (!open) return;

    open.left_at = now;
    await this.voiceSessionRepo.save(open);
    const user = await this.client.users.fetch(payload.voice_user_id);
    const text = `[⚠️⚠️⚠️] Bạn vừa rời khỏi room event!`;
    await user.sendDM({
      t: text,
      mk: [{ type: EMarkdownType.PRE, s: 0, e: text.length }],
    });
  }

  async calculateVoiceTimeMap(dateStr: string) {
    const parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
    const dayStart = startOfDay(parsed);
    const dayEnd = endOfDay(parsed);

    const rows = await this.voiceSessionRepo.query(
      `
        WITH bounds AS (
          SELECT
            ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') AS t1,
            ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') AS t2
        )
        SELECT
          s.user_id,
          SUM(
            GREATEST(
              0,
              EXTRACT(
                EPOCH FROM (
                  LEAST(COALESCE(s.left_at, b.t2), b.t2)
                  -
                  GREATEST(s.joined_at, b.t1)
                )
              )
            )
          ) * 1000 AS total_ms
        FROM "komu_voiceSession" s
        CROSS JOIN bounds b
        WHERE
          s.joined_at < b.t2
          AND (s.left_at IS NULL OR s.left_at > b.t1)
          AND s.is_in_event = true
        GROUP BY s.user_id
        `,
      [dayStart, dayEnd],
    );
    console.log('rows', rows);
    const userMap = new Map<string, number>();
    for (const row of rows) {
      const ms = Number(row.total_ms);
      if (ms > 0) {
        userMap.set(row.user_id, ms);
      }
    }

    return userMap;
  }

  async buildVoiceReportResult(userMap: Map<string, number>, dateStr: string) {
    const result: Array<{
      user_id: string;
      email: string;
      totalTime: number;
      date: string;
    }> = [];
    const userIds = Array.from(userMap.keys());

    const users = await this.userRepository.find({
      where: {
        userId: In(userIds),
      },
    });

    const userDict = new Map(users.map((u) => [u.userId, u]));

    for (const [user_id, totalMs] of userMap.entries()) {
      const user = userDict.get(user_id);
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

  async reportVoiceTimeByDay(dateStr: string) {
    const userMap = await this.calculateVoiceTimeMap(dateStr);
    return this.buildVoiceReportResult(userMap, dateStr);
  }

  private lastPresenceWarnAt = new Map<string, number>(); // user_id -> lastWarnMs

  private shouldWarn(
    userId: string,
    nowMs: number,
    cooldownMs = 10 * 60 * 1000,
  ) {
    const last = this.lastPresenceWarnAt.get(userId) ?? 0;
    if (nowMs - last < cooldownMs) return false;
    this.lastPresenceWarnAt.set(userId, nowMs);
    return true;
  }

  @Cron('0 * * * * *')
  async reconcileOpenSessionsByPresence() {
    const now = new Date();
    const nowMs = now.getTime();

    const openSessions = await this.voiceSessionRepo
      .createQueryBuilder('s')
      .innerJoin(EventMezon, 'e', 'e.id = s.event_id')
      .select([
        's.id as session_id',
        's.user_id as user_id',
        's.voice_channel_id as voice_channel_id',
        's.event_id as event_id',
        'e.clandId as clan_id',
        'e.channelVoiceId as event_voice_channel_id',
        'e.timeEnd as timeEnd',
      ])
      .where('s.left_at IS NULL')
      .andWhere('s.is_in_event = true')
      .andWhere('s.event_id IS NOT NULL')
      .andWhere('(e.timeEnd IS NULL OR e.timeEnd >= :nowMs)', { nowMs })
      .getRawMany<{
        session_id: string;
        user_id: string;
        voice_channel_id: string;
        event_id: string;
        clan_id: string;
        event_voice_channel_id: string;
        timeEnd: string | null;
      }>();

    if (!openSessions.length) return;

    const byClan = new Map<string, typeof openSessions>();
    for (const s of openSessions) {
      const arr = byClan.get(s.clan_id) ?? [];
      arr.push(s);
      byClan.set(s.clan_id, arr);
    }

    let closed = 0;

    for (const [clanId, sessions] of byClan.entries()) {
      let voiceUsers: Array<{
        id: string;
        channel_id: string;
        user_id: string;
        participant?: string;
      }> = [];

      try {
        voiceUsers =
          await this.voiceUsersCacheService.listMezonVoiceUsers(clanId);
      } catch (err) {
        this.logger.warn(
          `listMezonVoiceUsers failed clan=${clanId}: ${String(err)}`,
        );
        continue;
      }

      const presentByChannel = new Map<string, Set<string>>();
      for (const u of voiceUsers ?? []) {
        const ch = u.channel_id;
        const uid = u.user_id;
        if (!ch || !uid) continue;

        let set = presentByChannel.get(ch);
        if (!set) {
          set = new Set<string>();
          presentByChannel.set(ch, set);
        }
        set.add(uid);
      }

      const eventChannelIds = new Set<string>(
        sessions.map((x) => x.event_voice_channel_id).filter(Boolean),
      );

      const presentUsersInAnyEventChannel = new Set<string>();
      for (const ch of eventChannelIds) {
        const set = presentByChannel.get(ch);
        if (!set) continue;
        for (const uid of set) presentUsersInAnyEventChannel.add(uid);
      }

      const toCloseIds: string[] = [];

      for (const s of sessions) {
        const presentSet =
          presentByChannel.get(s.event_voice_channel_id) ?? new Set<string>();
        const isPresent = presentSet.has(s.user_id);

        if (!isPresent) {
          const isInOtherEvent = presentUsersInAnyEventChannel.has(s.user_id);

          if (!isInOtherEvent && this.shouldWarn(s.user_id, nowMs)) {
            try {
              const user = await this.client.users.fetch(s.user_id);
              const text =
                '[⚠️⚠️⚠️] Bạn vừa bị tính đã thoát khỏi room opentalk do KOMU không tìm thấy bạn trong room opentalk nào cả!\nNếu bạn vẫn đang xem, hãy thoát ra rồi vào lại! Xin cảm ơn!';
              await user.sendDM({
                t: text,
                mk: [{ type: EMarkdownType.PRE, s: 0, e: text.length }],
              });
            } catch (err) {
              this.logger.warn(
                `sendDM failed user=${s.user_id} clan=${clanId}: ${String(err)}`,
              );
            }
          }

          toCloseIds.push(s.session_id);
        }
      }

      if (!toCloseIds.length) continue;

      await this.voiceSessionRepo.update(
        { id: In(toCloseIds) } as any,
        { left_at: now } as any,
      );

      closed += toCloseIds.length;
    }

    if (closed > 0) {
      this.logger.log(
        `Reconciled & closed ${closed} open sessions by presence`,
      );
    }
  }

  async adjustUserVoiceSessionTime(
    userId: string,
    minute: number,
    type: UpdateTimeType,
  ) {
    if (minute <= 0) return;

    const latestSession = await this.voiceSessionRepo.findOne({
      where: {
        user_id: userId,
        left_at: Not(IsNull()),
        is_in_event: true,
      } as any,
      order: {
        left_at: 'DESC',
      } as any,
    });

    if (!latestSession) return;

    const direction = type === UpdateTimeType.DOWN ? -1 : 1;
    const deltaMs = direction * minute * 60 * 1000;

    const newLeftAtMs = latestSession.left_at!.getTime() + deltaMs;
    if (newLeftAtMs <= latestSession.joined_at.getTime()) {
      latestSession.left_at = latestSession.joined_at;
    } else {
      latestSession.left_at = new Date(newLeftAtMs);
    }

    await this.voiceSessionRepo.save(latestSession);

    this.logger.log(
      `Adjusted voice time user=${userId} type=${type} minute=${minute}`,
    );
  }
}
