import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, VoiceJoinedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { VoiceSessionTrackingService } from '../services/voiceSessionTracking.services';

@Injectable()
export class EventVoiceJoined extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private voiceSessionTrackingService: VoiceSessionTrackingService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.VoiceJoinedEvent)
  async handleVoiceJoined(data: VoiceJoinedEvent) {
    if (data.clan_id !== process.env.KOMUBOTREST_CLAN_NCC_ID) return;
    await this.voiceSessionTrackingService.onVoiceJoined({
      clan_id: data.clan_id,
      user_id: data.user_id,
      participant: data.participant,
      voice_channel_id: data.voice_channel_id,
    });
  }
}
