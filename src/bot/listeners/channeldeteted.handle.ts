import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelDeletedEvent, Events } from 'mezon-sdk';
import { Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon } from '../models/mezonChannel.entity';
import { Meeting } from '../models';

@Injectable()
export class EventListenerChannelDeleted extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.ChannelDeleted)
  async handleChannelDeleted(channelInput: ChannelDeletedEvent) {
    const { channel_id, clan_id } = channelInput;
    await this.channelRepository.delete({ clan_id, channel_id });
    await this.meetingRepository.delete({ channelId: channel_id });
  }
}
