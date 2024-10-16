import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Events, UserChannelRemovedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { BOT_ID } from '../constants/configs';

@Injectable()
export class EventListenerUserChannelRemoved extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private eventEmitter: EventEmitter2,
  ) {
    super(clientService);
  }

  @OnEvent(Events.UserChannelRemoved)
  async handleUserRemovedChannel(input: UserChannelRemovedEvent) {
    if (input.user_ids.some((user_id) => user_id == BOT_ID)) {
      const { channel_id } = input;

      this.eventEmitter.emit(Events.ChannelDeleted, {
        channel_id,
      });
    }

    // Save the updated channel back to the database
  }
}
