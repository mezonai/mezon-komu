import { Injectable, Logger } from '@nestjs/common';
import {
  ApiMessageReaction,
  MezonClient,
  Events,
  ChannelMessage,
  TokenSentEvent,
  StreamingJoinedEvent,
  StreamingLeavedEvent,
  UserChannelRemoved,
  GiveCoffeeEvent,
  AddClanUserEvent,
} from 'mezon-sdk';

import {
  ChannelCreatedEvent,
  ChannelDeletedEvent,
  ChannelUpdatedEvent,
  UserChannelAddedEvent,
  UserClanRemovedEvent,
} from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ExtendersService } from '../services/extenders.services';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../models';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from '../constants/configs';
import { RoleAssignedEvent } from 'mezon-sdk/dist/cjs/rtapi/realtime';

@Injectable()
export class BotGateway {
  private readonly logger = new Logger(BotGateway.name);
  private client: MezonClient;

  constructor(
    private clientService: MezonClientService,
    private extendersService: ExtendersService,
    private eventEmitter: EventEmitter2,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.client = clientService.getClient();
  }

  initEvent() {
    this.client.onWebrtcSignalingFwd((data) => {
      console.log('handlewebrtcsignalingfwd', data);
    });

    this.client.onTokenSend((data: TokenSentEvent) => {
      this.eventEmitter.emit(Events.TokenSend, data);
    });

    this.client.onMessageButtonClicked((data) => {
      this.eventEmitter.emit(Events.MessageButtonClicked, data);
    });

    this.client.onStreamingJoinedEvent((data: StreamingJoinedEvent) => {
      this.eventEmitter.emit(Events.StreamingJoinedEvent, data);
    });

    this.client.onStreamingLeavedEvent((data: StreamingLeavedEvent) => {
      this.eventEmitter.emit(Events.StreamingLeavedEvent, data);
    });

    this.client.onClanEventCreated((data) => {
      this.eventEmitter.emit(Events.ClanEventCreated, data);
    });

    this.client.onMessageReaction((msg: ApiMessageReaction) => {
      this.eventEmitter.emit(Events.MessageReaction, msg);
    });

    this.client.onChannelCreated((channel: ChannelCreatedEvent) => {
      this.eventEmitter.emit(Events.ChannelCreated, channel);
    });

    this.client.onUserClanRemoved((user: UserClanRemovedEvent) => {
      this.eventEmitter.emit(Events.UserClanRemoved, user);
    });

    this.client.onRoleEvent((data) => {
      this.eventEmitter.emit(Events.RoleEvent, data);
    });

    this.client.onRoleAssign((data) => {
      this.eventEmitter.emit(Events.RoleAssign, data);
    });

    this.client.onUserChannelAdded((user: UserChannelAddedEvent) => {
      this.eventEmitter.emit(Events.UserChannelAdded, user);
    });

    this.client.onChannelDeleted((channel: ChannelDeletedEvent) => {
      this.eventEmitter.emit(Events.ChannelDeleted, channel);
    });

    this.client.onChannelUpdated((channel: ChannelUpdatedEvent) => {
      this.eventEmitter.emit(Events.ChannelUpdated, channel);
    });

    this.client.onUserChannelRemoved((msg: UserChannelRemoved) => {
      this.eventEmitter.emit(Events.UserChannelRemoved, msg);
    });

    this.client.onGiveCoffee((data: GiveCoffeeEvent) => {
      this.eventEmitter.emit(Events.GiveCoffee, data);
    });

    this.client.onAddClanUser((data: AddClanUserEvent) => {
      this.eventEmitter.emit(Events.AddClanUser, data);
    });

    this.client.onRoleAssign((data: RoleAssignedEvent) => {
      this.eventEmitter.emit(Events.RoleAssign, data);
      console.log(data);
    });

    this.client.onChannelMessage(async (message) => {
      ['attachments', 'mentions', 'references'].forEach((key) => {
        if (!Array.isArray(message[key])) message[key] = [];
      });
      try {
        if (message.sender_id && message.sender_id !== '0') {
          await this.extendersService.addDBUser(message);
        }
      } catch (e) {
        console.log(e);
      }
      this.eventEmitter.emit(Events.ChannelMessage, message);
    });
  }
}
