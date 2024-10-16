import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Events, UserChannelAddedEvent } from 'mezon-sdk';
import { Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon } from '../models/mezonChannel.entity';

@Injectable()
export class EventListenerUserChannelAdded extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    private eventEmitter: EventEmitter2,
  ) {
    super(clientService);
  }

  @OnEvent(Events.UserChannelAdded)
  async handleChannelAdded(input: UserChannelAddedEvent) {
    const channelId = input.channel_id;
    // Find the channel by channel_id
    const channel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    if (!channel) {
      const {
        channel_id,
        clan_id,
        channel_type,
        is_public,
        status,
        parent_id,
      } = input;
      const channel_private = is_public ? 0 : 1;
      this.eventEmitter.emit(Events.ChannelCreated, {
        channel_id,
        clan_id,
        channel_type,
        channel_private,
        status: Number(status),
        parrent_id: parent_id,
      });
    } else {
      this.channelRepository.update(
        { channel_id: channelId },
        { channel_private: input.is_public ? 0 : 1 },
      );
    }

    // Save the updated channel back to the database
  }
}
