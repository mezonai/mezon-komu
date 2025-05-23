import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, VoiceLeavedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { OpentalkService } from '../services/opentalk.services';

@Injectable()
export class EventVoiceLeaved extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private opentalkService: OpentalkService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.VoiceLeavedEvent)
  async handleVoiceLeaved(data: VoiceLeavedEvent) {
    try {
      const now = new Date();
      const day = now.getDay();
      if (day !== 6) return;
      await this.opentalkService.handleVoiceLeaved(data);
    } catch (error) {
      console.log('handleVoiceLeaved');
    }
  }
}
