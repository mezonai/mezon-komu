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
      if (data.event_status === 0 && data.action === 1) {
        const EventMezonData = new EventMezon();
        EventMezonData.id = data.event_id;
        EventMezonData.logo = data.logo;
        EventMezonData.address = data.address;
        EventMezonData.clandId = data.clan_id;
        EventMezonData.channelId = data.channel_id;
        EventMezonData.channelVoiceId = data.channel_voice_id;
        EventMezonData.timeStart = +data.start_time_seconds * 1000;
        EventMezonData.timeEnd = +data.end_time_seconds * 1000;
        EventMezonData.activeBet = true;
        EventMezonData.title = data.title;
        EventMezonData.description = data.description;
        EventMezonData.active = true;
        await this.eventMezonRepository.insert(EventMezonData);
      }
      if (data.event_status === 0 && data.action === 3) {
        const eventFound = await this.eventMezonRepository.findOne({
          where: { id: data.event_id },
        });
        if (eventFound) {
          eventFound.active = false;
        }
        await this.eventMezonRepository.update(
          { id: data.event_id },
          { ...eventFound },
        );
      }
      if (data.event_status === 0 && data.action === 2) {
        const eventFound = await this.eventMezonRepository.findOne({
          where: { id: data.event_id },
        });
        const EventMezonData = new EventMezon();
        EventMezonData.id = data.event_id;
        EventMezonData.logo = data.logo;
        EventMezonData.address = data.address;
        EventMezonData.clandId = data.clan_id;
        EventMezonData.channelId = data.channel_id;
        EventMezonData.channelVoiceId = data.channel_voice_id;
        EventMezonData.timeStart = data.start_time
          ? new Date(data.start_time).getTime()
          : EventMezonData.timeStart;
        EventMezonData.timeEnd = data.end_time
          ? new Date(data.end_time).getTime()
          : EventMezonData.timeEnd;
        EventMezonData.title = data.title;
        EventMezonData.description = data.description;
        if (eventFound) {
          await this.eventMezonRepository.update(
            { id: data.event_id },
            { ...EventMezonData },
          );
        } else {
          await this.eventMezonRepository.insert(EventMezonData);
        }
      }
    } catch (error) {
      console.log('handleClanEventCreated', error);
    }
  }
}
