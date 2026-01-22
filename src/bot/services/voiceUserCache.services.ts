import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';

type VoiceUser = any;

type CacheEntry = {
  value?: VoiceUser[];
  updatedAt: number;
  inFlight?: Promise<VoiceUser[]>;
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
        const res = await clan.listChannelVoiceUsers(
          '',
          ChannelType.CHANNEL_TYPE_GMEET_VOICE,
        );
        return res?.voice_channel_users ?? [];
      },
    );
  }

  invalidate(clanId: string, channelType: ChannelType) {
    this.cache.delete(`${clanId}:${channelType}`);
  }
}
