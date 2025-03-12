import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChannelType, Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MentionSchedulerService } from '../scheduler/mention-scheduler.services';
import { ClientConfigService } from '../config/client-config.service';
import { EMessageMode } from '../constants/configs';
import { MessageQueue } from '../services/messageQueue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelMezon } from '../models';

@Injectable()
export class EventGiveCoffee extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private mentionSchedulerService: MentionSchedulerService,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
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
      const findChannel = await this.channelRepository.findOne({
        where: { channel_id: data?.channel_id },
      });
      const isThread =
        findChannel?.channel_type === ChannelType.CHANNEL_TYPE_THREAD ||
        (findChannel?.parrent_id !== '0' && findChannel?.parrent_id !== '');

      const firstText = `@${authorName} just sent a coffee to `;
      const messageContent =
        firstText +
        `@${userName} at ${isThread ? 'thread' : 'channel'} #${findChannel?.channel_label || ''}!`; // '#' at message is channel, auto fill at FE

      const replyMessage = {
        clan_id: data.clan_id,
        channel_id: this.clientConfig.welcomeChannelId,
        is_public: true,
        is_parent_public: true,
        parent_id: '0',
        mode: EMessageMode.CHANNEL_MESSAGE,
        msg: {
          t: messageContent,
          hg: [
            {
              channelid: data.channel_id,
              s:
                messageContent.length -
                (2 + (findChannel?.channel_label || '').length), // replace to '#' in text
              e: messageContent.length - 1, // replace to '#' in text
            },
          ],
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
