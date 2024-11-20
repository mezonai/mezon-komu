import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EMarkdownType, Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MessageQueue } from '../services/messageQueue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { BetEventMezon, EventMezon, User } from '../models';
import { BetStatus, EMessageMode } from '../constants/configs';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class EventTokenSend extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(BetEventMezon)
    private betEventMezonRepository: Repository<BetEventMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private messageQueue: MessageQueue,
  ) {
    super(clientService);
  }

  @OnEvent(Events.TokenSend)
  async handleBetEvent(data) {
    try {
      if (data.receiver_id !== process.env.BOT_KOMU_ID) return;
      // TODO: real query for findEvent
      // const findEvent = await this.betEventMezonRepository.findOne({
      //   where: { userId: data.sender_id, amount: 0, id: data.bet_id },
      // });

      // fake data
      const findEvent = await this.betEventMezonRepository.find({
        where: { userId: data.sender_id, amount: 0 },
      });

      if (findEvent[0]) {
        // fake data, real: if (findEvent) {}
        const findUser = await this.userRepository.findOne({
          where: { userId: findEvent[0].userId },
        });
        await this.betEventMezonRepository.update(
          { id: findEvent[0].id },
          { amount: data.amount },
        );
        // send to user
        const messageTextDM =
          '```' +
          `[BET - ${findEvent[0].id}]\n✅You just paid ${data.amount} token successfully. Let's wait for the results!` +
          '```';
        const messageToUser: ReplyMezonMessage = {
          userId: findEvent[0].userId,
          textContent: messageTextDM,
          messOptions: { mk: [{ type: 't', s: 0, e: messageTextDM.length }] },
        };
        this.messageQueue.addMessage(messageToUser);
        // send to channel
        const messageText =
          '```' +
          `[BET - ${findEvent[0].id}]\n✅${findUser.username} just paid successfully!` +
          '```';
        const replyMessage = {
          clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
          channel_id: process.env.MEZON_BET_CHANNEL_ID || '1840655908913287168',
          is_public: false,
          parent_id: '0',
          mode: EMessageMode.THREAD_MESSAGE,
          msg: {
            t: messageText,
            mk: [{ type: EMarkdownType.TRIPLE, s: 0, e: messageText.length }],
          },
        };
        this.messageQueue.addMessage(replyMessage);
      }
    } catch (error) {
      console.log('handleTokenSend', error);
    }
  }
}
