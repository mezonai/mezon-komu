import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiMessageReaction, ChannelType, Events } from 'mezon-sdk';
import {
  Mentioned,
  MezonBotMessage,
  User,
  WorkFromHome,
} from '../models';
import { LessThan, Repository } from 'typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { BOT_ID, EMessageMode, EUserType } from '../constants/configs';
import { ClientConfigService } from '../config/client-config.service';
import { AxiosClientService } from '../services/axiosClient.services';
import { MentionSchedulerService } from '../scheduler/mention-scheduler.services';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { MessageQueue } from '../services/messageQueue.service';
import { PollService } from '../services/poll.service';

@Injectable()
export class EventListenerMessageReaction extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(Mentioned)
    private mentionedRepository: Repository<Mentioned>,
    private clientConfig: ClientConfigService,
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    private pollService: PollService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.MessageReaction)
  async handleReactMessageMention(messageReaction: ApiMessageReaction) {
    await this.mentionedRepository
      .createQueryBuilder()
      .update(Mentioned)
      .set({ confirm: true, reactionTimestamp: Date.now() })
      .where(`"messageId" = :messageId`, {
        messageId: messageReaction.message_id,
      })
      .andWhere(`"mentionUserId" = :mentionUserId`, {
        mentionUserId: messageReaction.sender_id,
      })
      .andWhere(`"reactionTimestamp" IS NULL`)
      .execute();
  }


  @OnEvent(Events.MessageReaction)
  async handleReactMessagePoll(messageReaction: ApiMessageReaction) {
    if (messageReaction.sender_id === this.clientConfig.botKomuId) return;
    const findMessagePoll = await this.mezonBotMessageRepository.findOne({
      where: { messageId: messageReaction.message_id, deleted: false },
    });
    if (!findMessagePoll) return;

    let userReactMessageId = findMessagePoll.pollResult?.map((item) =>
      JSON.parse(item),
    ) || [];
    const options = this.pollService.getOptionPoll(findMessagePoll.content);
    let checkExist = false;
    if (
      !isNaN(Number(messageReaction.emoji)) &&
      Number(messageReaction.emoji) <= options.length
    ) {
      if (userReactMessageId.length && !messageReaction.action) {
        userReactMessageId = userReactMessageId.map((user) => {
          if (user.username === messageReaction.sender_name) {
            checkExist = true;
            return { ...user, emoji: messageReaction.emoji };
          }
          return user;
        });
      }

      if (!checkExist && !messageReaction.action) {
        userReactMessageId.push({
          username: messageReaction.sender_name,
          emoji: messageReaction.emoji,
        });
      }

      if (messageReaction.action) {
        userReactMessageId = userReactMessageId.filter((user) => {
          return !(
            user.username === messageReaction.sender_name &&
            +user.emoji === +messageReaction.emoji
          );
        });
      }

      this.mezonBotMessageRepository.update(
        { messageId: findMessagePoll.messageId },
        { pollResult: userReactMessageId },
      );
    }
  }

  @OnEvent(Events.MessageReaction)
  async handleResultPoll(messageReaction) {
    const findMessagePoll = await this.mezonBotMessageRepository.findOne({
      where: { messageId: messageReaction?.message_id, deleted: false },
    });
    if (!findMessagePoll) return;

    if (
      messageReaction?.sender_id === findMessagePoll.userId &&
      messageReaction?.emoji === 'checked' &&
      !messageReaction?.action
    ) {
      this.pollService.handleResultPoll(findMessagePoll);
    }
  }
}
