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
    const channel = this.channelRepository.create(channelInput);
    return await this.channelRepository.save(channel);
  }
}
