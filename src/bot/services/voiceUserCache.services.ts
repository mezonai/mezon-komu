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
  inFlight?: Promise<VoiceUser[]>;
  pendingMutations?: VoiceCacheMutation[];
};

@Injectable()
export class VoiceUsersCacheService {
  private readonly logger = new Logger(VoiceUsersCacheService.name);
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

    // Start tracking events once a consumer has initiated the first API fetch,
    // even if that fetch returns an empty snapshot.
    if (!entry) return;

    if (entry.value) {
      this.applyMutation(entry.value, mutation);
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

    let entry = this.cache.get(key);
    if (!entry) {
      entry = { value: [] };
      this.cache.set(key, entry);
    }

    if (entry.inFlight) {
      return entry.inFlight;
    }

    entry.inFlight = (async () => {
      try {
        const fresh = (await fetcher()) ?? [];
        if (fresh.length > 0) {
          entry!.pendingMutations?.forEach((mutation) =>
            this.applyMutation(fresh, mutation),
          );
          entry!.value = fresh;
        }
        return entry!.value ?? [];
      } catch (err) {
        this.logger.warn(`Fetch voice users failed for ${key}: ${String(err)}`);
        throw err;
      } finally {
        entry!.pendingMutations = [];
        entry!.inFlight = undefined;
      }
    })();

    return entry.inFlight;
  }

  async initializeCache(clanId: string) {
    if (!clanId) {
      this.logger.warn('Voice cache initialization skipped: clan ID is missing.');
      return;
    }

    try {
      await this.listMezonVoiceUsers(clanId);
    } catch (error) {
      this.logger.warn(
        `Voice cache initialization failed for clan=${clanId}: ${String(error)}`,
      );
    }
  }

  async listMezonVoiceUsers(clanId: string) {
    console.log('Call api list voice user')
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

  getCachedMezonVoiceUsers(clanId: string): VoiceUser[] | undefined {
    const value = this.cache.get(
      `${clanId}:${ChannelType.CHANNEL_TYPE_GMEET_VOICE}`,
    )?.value;
    return value?.map((room) => ({
      ...room,
      user_ids: [...(room.user_ids ?? [])],
    }));
  }

  invalidate(clanId: string, channelType: ChannelType) {
    this.cache.delete(`${clanId}:${channelType}`);
  }
}
