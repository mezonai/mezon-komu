import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChannelMezon } from '../models';
import { VoiceUsersCacheService } from './voiceUserCache.services';

type RoomReservationMap = Map<string, number>;
type HolderReservationMap = Map<string, { channelId: string; expiresAt: number }>;
type VoiceChannelUser = {
  channel_id: string;
  user_ids?: string[];
};

@Injectable()
export class VoiceRoomAllocatorService {
  private readonly logger = new Logger(VoiceRoomAllocatorService.name);
  private readonly DEFAULT_ROOM_HOLD_MS = 5000;
  private readonly LOCK_WAIT_MS = 20;
  private readonly clanAllocationLocks = new Set<string>();
  private readonly roomReservations = new Map<string, RoomReservationMap>();
  private readonly holderReservations = new Map<string, HolderReservationMap>();

  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    private voiceUsersService: VoiceUsersCacheService,
  ) {}

  private async acquireClanAllocationLock(clanId: string) {
    while (this.clanAllocationLocks.has(clanId)) {
      await new Promise((resolve) => setTimeout(resolve, this.LOCK_WAIT_MS));
    }
    this.clanAllocationLocks.add(clanId);
  }

  private releaseClanAllocationLock(clanId: string) {
    this.clanAllocationLocks.delete(clanId);
  }

  private cleanupExpiredReservations(clanId: string) {
    const now = Date.now();

    const clanRoomReservations = this.roomReservations.get(clanId);
    if (clanRoomReservations) {
      clanRoomReservations.forEach((expiresAt, channelId) => {
        if (expiresAt <= now) {
          clanRoomReservations.delete(channelId);
        }
      });
      if (!clanRoomReservations.size) {
        this.roomReservations.delete(clanId);
      }
    }

    const clanHolderReservations = this.holderReservations.get(clanId);
    if (clanHolderReservations) {
      clanHolderReservations.forEach((reservation, holderId) => {
        if (reservation.expiresAt <= now) {
          clanHolderReservations.delete(holderId);
        }
      });
      if (!clanHolderReservations.size) {
        this.holderReservations.delete(clanId);
      }
    }
  }

  private isRoomReserved(clanId: string, channelId: string) {
    this.cleanupExpiredReservations(clanId);
    const clanReservations = this.roomReservations.get(clanId);
    const expiresAt = clanReservations?.get(channelId);
    return !!expiresAt && expiresAt > Date.now();
  }

  private getHolderReservation(clanId: string, holderId: string) {
    this.cleanupExpiredReservations(clanId);
    return this.holderReservations.get(clanId)?.get(holderId);
  }

  private releaseHolderReservation(clanId: string, holderId: string) {
    this.cleanupExpiredReservations(clanId);
    const clanHolderReservations = this.holderReservations.get(clanId);
    const currentReservation = clanHolderReservations?.get(holderId);
    if (!currentReservation) return;

    clanHolderReservations.delete(holderId);
    if (!clanHolderReservations.size) {
      this.holderReservations.delete(clanId);
    }

    const clanRoomReservations = this.roomReservations.get(clanId);
    clanRoomReservations?.delete(currentReservation.channelId);
    if (clanRoomReservations && !clanRoomReservations.size) {
      this.roomReservations.delete(clanId);
    }
  }

  private getVoiceUserIds(voiceChannelUser: VoiceChannelUser) {
    return voiceChannelUser.user_ids?.filter(Boolean) ?? [];
  }

  reserveRoom(
    clanId: string,
    channelId: string,
    holdMs = this.DEFAULT_ROOM_HOLD_MS,
    holderId?: string,
  ) {
    this.cleanupExpiredReservations(clanId);
    const now = Date.now();
    const expiresAt = now + holdMs;
    const clanRoomReservations = this.roomReservations.get(clanId) ?? new Map();

    if (holderId) {
      const clanHolderReservations =
        this.holderReservations.get(clanId) ?? new Map();
      const currentReservation = clanHolderReservations.get(holderId);
      if (currentReservation?.channelId && currentReservation.channelId !== channelId) {
        clanRoomReservations.delete(currentReservation.channelId);
      }
      clanHolderReservations.set(holderId, { channelId, expiresAt });
      this.holderReservations.set(clanId, clanHolderReservations);
    }

    clanRoomReservations.set(channelId, expiresAt);
    this.roomReservations.set(clanId, clanRoomReservations);
  }

  pickRandomPreferredChannel(listVoiceChannelAvalable: ChannelMezon[]) {
    const listType10 = listVoiceChannelAvalable.filter(
      (item) => item.channel_type === 10,
    );
    const listType4 = listVoiceChannelAvalable.filter(
      (item) => item.channel_type === 4,
    );

    if (listType10.length > 0) {
      const randomIndex = Math.floor(Math.random() * listType10.length);
      return listType10[randomIndex];
    }
    if (listType4.length > 0) {
      const randomIndex = Math.floor(Math.random() * listType4.length);
      return listType4[randomIndex];
    }
    return null;
  }

  async getAvailableVoiceChannels(clanId: string) {
    let listChannelVoiceUsers: VoiceChannelUser[] = [];
    try {
      listChannelVoiceUsers = await this.voiceUsersService.listMezonVoiceUsers(clanId);
    } catch (error) {
      this.logger.warn(`listMezonVoiceUsers failed for clan=${clanId}: ${String(error)}`);
      return [];
    }

    const listVoiceChannel = await this.channelRepository.find({
      where: {
        channel_type: In([4, 10]),
        clan_id: clanId,
      },
    });
    const listVoiceChannelIdUsed = new Set<string>();
    listChannelVoiceUsers.forEach((item) => {
      if (item?.channel_id && this.getVoiceUserIds(item).length) {
        listVoiceChannelIdUsed.add(item.channel_id);
      }
    });
    this.logger.debug(
      `voice channel users clan=${clanId} channels=${listChannelVoiceUsers
        .map((item) => `${item.channel_id}:${this.getVoiceUserIds(item).length}`)
        .join(',')}`,
    );
    return listVoiceChannel.filter(
      (item) =>
        !listVoiceChannelIdUsed.has(item.channel_id) &&
        !this.isRoomReserved(clanId, item.channel_id),
    );
  }

  async allocatePreferredRoom(
    clanId: string,
    holderId?: string,
    holdMs = this.DEFAULT_ROOM_HOLD_MS,
  ) {
    await this.acquireClanAllocationLock(clanId);
    try {
      let previousChannelId: string | undefined;
      if (holderId) {
        const existingReservation = this.getHolderReservation(clanId, holderId);
        if (existingReservation?.channelId) {
          previousChannelId = existingReservation.channelId;
          this.releaseHolderReservation(clanId, holderId);
        }
      }

      const listVoiceChannelAvalable = await this.getAvailableVoiceChannels(clanId);
      const listVoiceChannelPreferred =
        previousChannelId && listVoiceChannelAvalable.length > 1
          ? listVoiceChannelAvalable.filter(
              (item) => item.channel_id !== previousChannelId,
            )
          : listVoiceChannelAvalable;
      const selectedChannel = this.pickRandomPreferredChannel(
        listVoiceChannelPreferred.length
          ? listVoiceChannelPreferred
          : listVoiceChannelAvalable,
      );
      if (selectedChannel?.channel_id) {
        this.reserveRoom(clanId, selectedChannel.channel_id, holdMs, holderId);
      }
      return selectedChannel;
    } finally {
      this.releaseClanAllocationLock(clanId);
    }
  }
}
