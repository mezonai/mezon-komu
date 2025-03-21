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
    const channelId = input.channel_desc.channel_id;
    // Find the channel by channel_id
    const channel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    if (!channel) {
      const {
        channel_id,
        clan_id,
        type,
        channel_private,
        parent_id,
        channel_label,
        category_id,
        meeting_code
      } = input.channel_desc;
      this.eventEmitter.emit(Events.ChannelCreated, {
        channel_id,
        clan_id,
        channel_type: type,
        channel_private,
        status: Number(input.status),
        parent_id: parent_id,
        channel_label,
        category_id,
        meeting_code
      });
    } else {
      this.channelRepository.update(
        { channel_id: channelId },
        { channel_private: input.channel_desc.channel_private,
          channel_label: input.channel_desc.channel_label,
          category_id: input.channel_desc.category_id
         },
      );
    }

    // Save the updated channel back to the database
  }
}
