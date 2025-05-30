import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, VoiceJoinedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { OpentalkService } from '../services/opentalk.services';

@Injectable()
export class EventVoiceJoined extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private opentalkService: OpentalkService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.VoiceJoinedEvent)
  async handleVoiceJoined(data: VoiceJoinedEvent) {
    const now = new Date();
    const day = now.getDay();
    if (day !== 6) return;
    console.log('handleVoiceJoined', data)

    try {
      await this.opentalkService.handleVoiceJoined(data);
    } catch (error) {
      console.log('handleVoiceJoined');
    }
  }
}
