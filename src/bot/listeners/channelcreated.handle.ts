import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelCreatedEvent, Events } from 'mezon-sdk';
import { Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';

import { ChannelMezon } from '../models/mezonChannel.entity';

@Injectable()
export class EventListenerChannelCreated extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.ChannelCreated)
  async handleCreatedChannel(channelInput: ChannelCreatedEvent) {
    const channelId = channelInput.channel_id;
    const findChannel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    if (findChannel) return;
    const channel = this.channelRepository.create({
      ...channelInput,
      channel_type: channelInput.channel_type,
    }); 
    return await this.channelRepository.save(channel);
  }
}
