import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, VoiceLeavedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { VoiceSessionTrackingService } from '../services/voiceSessionTracking.services';

@Injectable()
export class EventVoiceLeaved extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private voiceSessionTrackingService: VoiceSessionTrackingService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.VoiceLeavedEvent)
  async handleVoiceLeaved(data: VoiceLeavedEvent) {
    await this.voiceSessionTrackingService.onVoiceLeft({
      clan_id: data.clan_id,
      voice_channel_id: data.voice_channel_id,
      voice_user_id: data.voice_user_id,
    });
  }
}
