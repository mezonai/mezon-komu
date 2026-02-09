import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelCreatedEvent, Events } from 'mezon-sdk';
import { Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon } from '../models/mezonChannel.entity';
import { sleep } from '../utils/helper';

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
    let channel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });

    for (let i = 0; !channel && i < 10; i++) {
      await sleep(100);
      channel = await this.channelRepository.findOne({
        where: { channel_id: channelId },
      });
    }
    if (!channel) return;
    return await this.channelRepository.update(
      { channel_id: channelId },
      {
        channel_label: channelInput.channel_label,
        channel_private: channelInput.channel_private ? 1 : 0,
        channel_type: channel.channel_type,
        meeting_code: (channelInput as any).meeting_code,
      },
    );
  }
}
