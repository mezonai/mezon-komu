import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MentionSchedulerService } from '../scheduler/mention-scheduler.services';
import { ClientConfigService } from '../config/client-config.service';
import { EMessageMode } from '../constants/configs';
import { MessageQueue } from '../services/messageQueue.service';

@Injectable()
export class EventGiveCoffee extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private mentionSchedulerService: MentionSchedulerService,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
  ) {
    super(clientService);
  }

  @OnEvent(Events.GiveCoffee)
  async handleGiveCoffee(data) {
    try {
      const authorName = (
        await this.mentionSchedulerService.getUserData(data.sender_id)
      )?.userName;
      const userName = (
        await this.mentionSchedulerService.getUserData(data.receiver_id)
      )?.userName;

      if (!userName || !authorName) return;

      const firstText = `@${authorName} just sent a coffee to `;
      const messageContent = firstText + `@${userName}`;
      const replyMessage = {
        clan_id: data.clan_id,
        channel_id: this.clientConfig.welcomeChannelId,
        is_public: true,
        is_parent_public: true,
        parent_id: '0',
        mode: EMessageMode.CHANNEL_MESSAGE,
        msg: {
          t: messageContent,
        },
        mentions: [
          { user_id: data.sender_id, s: 0, e: authorName.length + 1 },
          {
            user_id: data.receiver_id,
            s: firstText.length,
            e: firstText.length + userName.length + 1,
          },
        ],
      };
      this.messageQueue.addMessage(replyMessage);
    } catch (error) {
      console.log('give coffee', error);
    }
  }
}
