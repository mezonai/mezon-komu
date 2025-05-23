import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, VoiceJoinedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { VoiceSessionService } from '../services/voiceSession.services';

@Injectable()
export class EventVoiceJoined extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private voiceSessionService: VoiceSessionService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.VoiceJoinedEvent)
  async handleVoiceJoined(data: VoiceJoinedEvent) {
    const now = new Date();
    const day = now.getDay();
    if (day !== 6) return;

    try {
      await this.voiceSessionService.handleVoiceJoined(data);
    } catch (error) {
      console.log('handleVoiceJoined');
    }
  }
}
