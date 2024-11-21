import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiMessageReaction, ChannelType, Events } from 'mezon-sdk';
import {
  Mentioned,
  MentionedPmConfirm,
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
    @InjectRepository(WorkFromHome)
    private wfhRepository: Repository<WorkFromHome>,
    private clientConfig: ClientConfigService,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(MentionedPmConfirm)
    private mentionPmConfirm: Repository<MentionedPmConfirm>,
    private axiosClientService: AxiosClientService,
    private mentionSchedulerService: MentionSchedulerService,
    private messageQueue: MessageQueue,
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
      // .andWhere('"authorId" != :authorId', {
      //   authorId: this.clientConfig.botKomuId,
      // })
      .execute();

    // TODO: apply react confirm
    // await this.handleReactionMentonMessage(messageReaction);
    // await this.handlePmConfirmWfh(messageReaction);
  }

  async handleReactionMentonMessage(messageReaction: ApiMessageReaction) {
    try {
      const data = await this.mentionedRepository
        .createQueryBuilder('mention')
        .where('mention.messageId = :messageId', {
          messageId: messageReaction.message_id,
        })
        .andWhere('mention.authorId = :authorId', {
          authorId: this.clientConfig.botKomuId,
        })
        .andWhere('mention.channelId = :channelId', {
          channelId: this.clientConfig.machleoChannelId,
        })
        .andWhere('mention.mentionUserId = :mentionUserId', {
          mentionUserId: messageReaction.sender_id,
        })
        .andWhere('mention.reactionTimestamp IS NULL')
        .getOne();

      if (!data || !['checked', 'x'].includes(messageReaction.emoji)) return;
      this.mentionedRepository.update(
        { messageId: messageReaction.message_id },
        { reactionTimestamp: new Date().getTime() },
      );
      if (messageReaction.emoji === 'checked') {
        await this.wfhRepository
          .createQueryBuilder()
          .update(WorkFromHome)
          .set({
            pmconfirm: false,
            data: 'komu_wfh_accept',
            status: 'ACCEPT',
          })
          .where(`"userId" = :userId`, { userId: data.mentionUserId })
          .execute();
        const messageToUser: ReplyMezonMessage = {
          userId: data.mentionUserId,
          textContent: 'You just accepted the machleo punishment. Thanks!!!',
        };
        this.messageQueue.addMessage(messageToUser);
      } else {
        const wfhdata = await this.wfhRepository.findOne({
          where: {
            createdAt: data.createdTimestamp,
          },
        });
        if (!wfhdata) {
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent: 'No WFH found',
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }
        const msec = (new Date() as any) - (new Date(wfhdata.createdAt) as any);
        if (msec > 3600000) {
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent:
              'WFH complain is expired. You have an hour to request.',
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }

        if (wfhdata.complain) {
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent: 'You have already complained.',
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }

        const userdb = await this.userRepository
          .createQueryBuilder()
          .where(`"userId" = :userId`, { userId: data.mentionUserId })
          .andWhere('"deactive" IS NOT True')
          .andWhere(`"user_type" = :user_type`, { user_type: EUserType.MEZON })
          .select('*')
          .getRawOne();
        if (!userdb) {
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent: 'User is not valid',
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }
        const url = encodeURI(
          `${this.clientConfig.wiki.api_url}${userdb.email}@ncc.asia`,
        );
        const response = await this.axiosClientService.get(url, {
          httpsAgent: this.clientConfig.https,
          headers: {
            'X-Secret-Key': this.clientConfig.wikiApiKeySecret,
          },
        });
        if (
          response.data == null ||
          response.data == undefined ||
          response.data.result == null ||
          response.data.result == undefined ||
          response.data.result.projectDtos == undefined ||
          response.data.result.projectDtos.length == 0
        ) {
          let msg = `There is no PM to confirm for **${userdb.email}**. Please contact to your PM`;
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent: msg,
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }

        const pmdb = await this.userRepository
          .createQueryBuilder()
          .where(`("username" = :username or "email" = :email)`, {
            username: response.data.result.projectDtos[0].pmUsername,
            email: response.data.result.projectDtos[0].pmUsername,
          })
          .andWhere(`"deactive" IS NOT true`)
          .andWhere(`"user_type" = :user_type`, { user_type: EUserType.MEZON })
          .select('*')
          .getRawOne();

        // to test
        // const pmdb = await this.userRepository
        //   .createQueryBuilder()
        //   .where(`"userId" = :userId`, { userId: '1827994776956309504' })
        //   .andWhere('"deactive" IS NOT True')
        //   .andWhere(`"user_type" = :user_type`, { user_type: EUserType.MEZON })
        //   .select('*')
        //   .getRawOne();

        if (!pmdb) {
          const messageToUser: ReplyMezonMessage = {
            userId: data.mentionUserId,
            textContent: `Cannot fetch data for PM ${response.data.result.projectDtos[0].pmUsername}`,
          };
          this.messageQueue.addMessage(messageToUser);
          return;
        }
        const contentMessage =
          '```' +
          `[CONFIRM WFH] [ID:${wfhdata.id}]` +
          `\n` +
          `<@${userdb.username}> just sent WFH complain. Please check?\n`;
        const confirmText = 'React ❌ to Reject or ✅ to Confirm```';
        const messageToUser: ReplyMezonMessage = {
          userId: pmdb.userId,
          textContent: contentMessage + confirmText,
          messOptions: {
            mk: [
              {
                type: 't',
                s: 0,
                e: contentMessage.length + confirmText.length,
              },
            ],
          },
        };
        this.messageQueue.addMessage(messageToUser);

        await this.wfhRepository.update({ id: wfhdata.id }, { complain: true });
        const messageToUserError: ReplyMezonMessage = {
          userId: userdb.userId,
          textContent: `${userdb.username} your WFH complain is sent to ${pmdb.username}.`,
        };
        this.messageQueue.addMessage(messageToUserError);
      }
    } catch (error) {
      console.log('handleReactionMentonMessage', error);
    }
  }

  async handlePmConfirmWfh(messageReaction: ApiMessageReaction) {
    try {
      const data = await this.mentionPmConfirm.findOne({
        where: { messageId: messageReaction.message_id, confirm: false },
      });
      if (!data || !['checked', 'x'].includes(messageReaction.emoji)) return;
      this.mentionPmConfirm.update(
        { messageId: messageReaction.message_id },
        {
          confirm: true,
          confirmAt: new Date().getTime(),
          value: messageReaction.emoji === 'checked' ? 'CONFIRM' : 'REJECT',
        },
      );
      const dataWfh = await this.wfhRepository.findOne({
        where: { id: data.wfhId },
      });
      const dataMention = await this.mentionedRepository.findOne({
        where: { createdTimestamp: dataWfh.createdAt },
      });

      const userId = dataMention.mentionUserId;
      const pmId = messageReaction.sender_id;
      const typeConfirm =
        messageReaction.emoji === 'checked' ? 'Confirmed' : 'Rejected';

      const dataBot = await this.userRepository.findOne({
        where: {
          userId: this.clientConfig.botKomuId,
        },
      });

      const pmUsername = (await this.mentionSchedulerService.getUserData(pmId))
        ?.userName;
      const username = (await this.mentionSchedulerService.getUserData(userId))
        ?.userName;
      if (!username || !pmUsername) return;

      const text = `${pmUsername} just ${typeConfirm} WFH complain from `;
      const messageContent = text + `${username}`;

      const replyMessage: ReplyMezonMessage = {
        clan_id: this.clientConfig.clandNccId,
        channel_id: this.clientConfig.machleoChannelId,
        is_public: false,
        is_parent_public: true,
        parent_id: '0',
        mode: EMessageMode.CHANNEL_MESSAGE,
        msg: {
          t: messageContent,
        },
        mentions: [
          { user_id: pmId, s: 0, e: pmUsername.length },
          {
            user_id: userId,
            s: text.length,
            e: text.length + username.length,
          },
        ],
        attachments: [],
        ref: [
          {
            message_ref_id: dataMention.messageId,
            message_sender_id: this.clientConfig.botKomuId,
            content: dataWfh.wfhMsg,
            ref_type: 0,
            message_sender_username: dataBot.username,
            mesages_sender_avatar: dataBot.avatar,
            message_sender_clan_nick: dataBot.clan_nick,
            message_sender_display_name: dataBot.display_name,
            has_attachment: false,
          },
        ],
      };
      this.messageQueue.addMessage(replyMessage);

      await this.wfhRepository
        .createQueryBuilder()
        .update(WorkFromHome)
        .set({
          pmconfirm: typeConfirm === 'Confirmed',
          data: messageContent,
          status: 'APPROVED',
        })
        .where(`"id" = :id`, {
          id: data.wfhId,
        })
        .execute();
      const messageToUser: ReplyMezonMessage = {
        userId: pmId,
        textContent: `You just ${typeConfirm} WFH complain for ${username}`,
      };
      this.messageQueue.addMessage(messageToUser);
    } catch (error) {
      console.log('handlePmConfirmWfh', error);
    }
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
