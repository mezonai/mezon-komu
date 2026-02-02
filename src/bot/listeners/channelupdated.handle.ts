import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelCreatedEvent, Events } from 'mezon-sdk';
import { Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon } from '../models/mezonChannel.entity';

@Injectable()
export class EventListenerChannelUpdated extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.ChannelUpdated)
  async handleChannelUpdated(channelInput: ChannelCreatedEvent) {
    const channelId = channelInput.channel_id;
    // Find the channel by channel_id
    const channel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    if (!channel) return;
    return await this.channelRepository.update(
      { channel_id: channelId },
      {
        ...channelInput,
        channel_private: channelInput.channel_private ? 1 : 0,
        channel_type: channel.channel_type,
      },
    );
  }
}
