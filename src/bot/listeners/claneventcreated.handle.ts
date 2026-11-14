import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { EMarkdownType, Events } from 'mezon-sdk';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { BetEventMezon, EventMezon, User } from '../models';
import {
  BetStatus,
  EmbedProps,
  EMessageMode,
  MEZON_EMBED_FOOTER,
  MEZON_IMAGE_URL,
} from '../constants/configs';
import { MessageQueue } from '../services/messageQueue.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class EventClanEventCreated extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(EventMezon)
    private eventMezonRepository: Repository<EventMezon>,
    private messageQueue: MessageQueue,
    @InjectRepository(BetEventMezon)
    private betEventMezonRepository: Repository<BetEventMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.ClanEventCreated)
  async handleClanEventCreated(data) {
    try {
      const timeStart = data.start_time_seconds
        ? +data.start_time_seconds * 1000
        : data.start_time
          ? new Date(data.start_time).getTime()
          : undefined;

      const timeEnd = data.end_time_seconds
        ? +data.end_time_seconds * 1000
        : data.end_time
          ? new Date(data.end_time).getTime()
          : undefined;

      if (data.action === 1) {
        const eventData =
          (await this.eventMezonRepository.findOne({
            where: { id: data.event_id },
          })) || new EventMezon();

        eventData.id = data.event_id;
        eventData.logo = data.logo;
        eventData.address = data.address;
        eventData.clandId = data.clan_id;
        eventData.channelId = data.channel_id;
        eventData.channelVoiceId = data.channel_voice_id;
        if (timeStart !== undefined) eventData.timeStart = timeStart;
        if (timeEnd !== undefined) eventData.timeEnd = timeEnd;
        eventData.activeBet = true;
        eventData.title = data.title;
        eventData.description = data.description;
        eventData.active = data.channel_id === '0' || !data.channel_id;
        await this.eventMezonRepository.save(eventData);
      }

      if (data.action === 3) {
        await this.eventMezonRepository.update(
          { id: data.event_id },
          { active: false },
        );
      }

      if (data.action === 2) {
        const eventFound = await this.eventMezonRepository.findOne({
          where: { id: data.event_id },
        });

        const eventData = eventFound || new EventMezon();
        eventData.id = data.event_id;
        eventData.logo = data.logo;
        eventData.address = data.address;
        eventData.clandId = data.clan_id;
        eventData.channelId = data.channel_id;
        eventData.channelVoiceId = data.channel_voice_id;
        if (timeStart !== undefined) eventData.timeStart = timeStart;
        if (timeEnd !== undefined) eventData.timeEnd = timeEnd;
        eventData.title = data.title;
        eventData.description = data.description;

        // If event was missed during creation, initialize active flags
        if (!eventFound) {
          eventData.activeBet = true;
          eventData.active = data.channel_id === '0' || !data.channel_id;
        }

        await this.eventMezonRepository.save(eventData);
      }
    } catch (error) {
      console.log('handleClanEventCreated', error);
    }
  }
}
