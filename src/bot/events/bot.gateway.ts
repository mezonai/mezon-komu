import { Injectable, Logger } from '@nestjs/common';
import {
  ApiMessageReaction,
  MezonClient,
  Events,
  ChannelMessage,
} from 'mezon-sdk';

import {
  ChannelCreatedEvent,
  ChannelDeletedEvent,
  ChannelUpdatedEvent,
  UserChannelAddedEvent,
  UserChannelRemovedEvent,
  UserClanRemovedEvent,
} from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ExtendersService } from '../services/extenders.services';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BotGateway {
  private readonly logger = new Logger(BotGateway.name);
  private client: MezonClient;

  constructor(
    private clientService: MezonClientService,
    private extendersService: ExtendersService,
    private eventEmitter: EventEmitter2,
  ) {
    this.client = clientService.getClient();
  }

  initEvent() {
    for (const event in Events) {
      const eventValue = Events[event].replace(/_event/g, '').replace(/_/g, '');
      this.logger.log(`Init event ${eventValue}`);
      const key = `handle${eventValue}`;
      if (key in this) {
        this.client.on(Events[event], this[key], this);
      }
    }
  }
  // processMessage(msg: ChannelMessage) {}

  handlemessagereaction = async (msg: ApiMessageReaction) => {
    this.eventEmitter.emit(Events.MessageReaction, msg);
  };

  handlechannelcreated = async (channel: ChannelCreatedEvent) => {
    this.eventEmitter.emit(Events.ChannelCreated, channel);
  };

  handleuserclanremoved(user: UserClanRemovedEvent) {
    this.eventEmitter.emit(Events.UserClanRemoved, user);
  }

  private async handlerole(msg) {
    console.log('role event', msg);
  }

  private async handleroleassign(msg) {
    console.log('role event assign', msg);
  }

  handleuserchanneladded = async (user: UserChannelAddedEvent) => {
    this.eventEmitter.emit(Events.UserChannelAdded, user);
  };

  handlechanneldeleted = async (channel: ChannelDeletedEvent) => {
    this.eventEmitter.emit(Events.ChannelDeleted, channel);
  };

  handlechannelupdated = async (channel: ChannelUpdatedEvent) => {
    this.eventEmitter.emit(Events.ChannelUpdated, channel);
  };

  handleuserchannelremoved = async (msg: UserChannelRemovedEvent) => {
    this.eventEmitter.emit(Events.UserChannelRemoved, msg);
  };

  handlegivecoffee = async (data) => {
    this.eventEmitter.emit(Events.GiveCoffee, data);
  };

  handleaddclanuser = async (data) => {
    this.eventEmitter.emit(Events.AddClanUser, data);
  };

  handleroleassigned = async (msg) => {
    console.log(msg);
  };

  handlechannelmessage = async (msg: ChannelMessage) => {
    if (msg.code) return; // ignored edited message
    ['attachments', 'mentions', 'references'].forEach((key) => {
      if (!Array.isArray(msg[key])) msg[key] = [];
    });
    try {
      if (msg.sender_id && msg.sender_id !== '0') {
        await this.extendersService.addDBUser(msg);
      }
    } catch (e) {
      console.log(e);
    }
    this.eventEmitter.emit(Events.ChannelMessage, msg);
  };
}
