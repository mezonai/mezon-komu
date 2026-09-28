import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';

type VoiceUser = any;

type VoiceCacheMutation = {
  type: 'join' | 'leave';
  channelId: string;
  userId: string;
};

type CacheEntry = {
  value?: VoiceUser[];
  updatedAt: number;
  inFlight?: Promise<VoiceUser[]>;
  pendingMutations?: VoiceCacheMutation[];
};

@Injectable()
export class VoiceUsersCacheService {
  private readonly logger = new Logger(VoiceUsersCacheService.name);
  private readonly TTL_MS = 2000;
  private readonly cache = new Map<string, CacheEntry>();
  private client: MezonClient;

  constructor(private clientService: MezonClientService) {
    this.client = this.clientService.getClient();
  }

  private applyMutation(
    voiceUsers: VoiceUser[],
    mutation: VoiceCacheMutation,
  ) {
    if (mutation.type === 'join') {
      // A user can move directly between rooms, so remove the old presence first.
      voiceUsers.forEach((room) => {
        room.user_ids =
          room.user_ids?.filter((userId) => userId !== mutation.userId) ?? [];
      });

      let room = voiceUsers.find(
        (item) => item.channel_id === mutation.channelId,
      );
      if (!room) {
        room = {
          channel_id: mutation.channelId,
          user_ids: [],
        };
        voiceUsers.push(room);
      }

      room.user_ids ??= [];
      if (!room.user_ids.includes(mutation.userId)) {
        room.user_ids.push(mutation.userId);
      }
      return;
    }

    const room = voiceUsers.find(
      (item) => item.channel_id === mutation.channelId,
    );
    if (room) {
      room.user_ids =
        room.user_ids?.filter((userId) => userId !== mutation.userId) ?? [];
    }
  }

  private applyVoiceEvent(clanId: string, mutation: VoiceCacheMutation) {
    if (!clanId || !mutation.channelId || !mutation.userId) return;

    const key = `${clanId}:${ChannelType.CHANNEL_TYPE_GMEET_VOICE}`;
    const entry = this.cache.get(key);

    // Do not create a partial cache from a single event. The next consumer will
    // fetch the complete snapshot from the API.
    if (!entry) return;

    if (entry.value) {
      this.applyMutation(entry.value, mutation);
      entry.updatedAt = Date.now();
    }

    // Preserve events received while an API request is in flight so the API
    // response cannot overwrite a newer join/leave state.
    if (entry.inFlight) {
      entry.pendingMutations ??= [];
      entry.pendingMutations.push(mutation);
    }
  }

  applyVoiceJoined(clanId: string, channelId: string, userId: string) {
    this.applyVoiceEvent(clanId, { type: 'join', channelId, userId });
  }

  applyVoiceLeft(clanId: string, channelId: string, userId: string) {
    this.applyVoiceEvent(clanId, { type: 'leave', channelId, userId });
  }

  async getVoiceUsers(
    clanId: string,
    channelType: ChannelType,
    fetcher: () => Promise<VoiceUser[]>,
  ): Promise<VoiceUser[]> {
    const key = `${clanId}:${channelType}`;
    const now = Date.now();

    let entry = this.cache.get(key);
    if (!entry) {
      entry = { updatedAt: 0 };
      this.cache.set(key, entry);
    }

    if (entry.value && now - entry.updatedAt <= this.TTL_MS) {
      return entry.value;
    }

    if (entry.inFlight) {
      return entry.inFlight;
    }

    entry.inFlight = (async () => {
      try {
        const fresh = (await fetcher()) ?? [];
        entry!.pendingMutations?.forEach((mutation) =>
          this.applyMutation(fresh, mutation),
        );
        entry!.pendingMutations = [];
        entry!.value = fresh;
        entry!.updatedAt = Date.now();
        return entry!.value;
      } catch (err) {
        this.logger.warn(`Fetch voice users failed for ${key}: ${String(err)}`);
        throw err;
      } finally {
        entry!.inFlight = undefined;
      }
    })();

    return entry.inFlight;
  }

  async listMezonVoiceUsers(clanId: string) {
    return this.getVoiceUsers(
      clanId,
      ChannelType.CHANNEL_TYPE_GMEET_VOICE,
      async () => {
        const clan = this.client.clans.get(clanId);
        const res = await clan.listChannelVoiceUsers();
        return res?.voice_channel_users ?? [];
      },
    );
  }

  invalidate(clanId: string, channelType: ChannelType) {
    this.cache.delete(`${clanId}:${channelType}`);
  }
}
