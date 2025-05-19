import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMessageAck, ChannelType, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon, User } from '../models';
import { Repository } from 'typeorm';
import { EMessageMode, ErrorSocketType, EUserType } from '../constants/configs';
import { MessageQueue } from './messageQueue.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';

@Injectable()
export class KomuService {
  private client: MezonClient;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientService: MezonClientService,
    private messageQueue: MessageQueue,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
  ) {
    this.client = clientService.getClient();
  }
  sendMessageKomuToUser = async (
    msg,
    userId,
    botPing = false,
    isSendQuiz = false,
    components,
    embed,
  ) => {
    try {
      const userdb = await this.userRepository
        .createQueryBuilder()
        .where('"userId" = :userId', {
          userId,
        })
        .andWhere('"user_type" = :userType', {
          userType: EUserType.MEZON.toString(),
        })
        .andWhere('"deactive" IS NOT True ')
        .select('*')
        .getRawOne();
      if (!userdb) {
        return null;
      }
      let sent: ChannelMessageAck;
      let newMessage;
      try {
        const clan = this.client.clans.get(process.env.KOMUBOTREST_CLAN_NCC_ID);
        console.log('userId DMM', userId);
        const user = clan.users.get(userId);
        if (!user) return;
        console.log('useruseruseruser DMM', user.id);
        sent = await user.sendDM({
          components,
          embed,
        });
      } catch (error) {
        await this.userRepository.update(
          { userId },
          { botPing: false },
        );
        switch (error) {
          case ErrorSocketType.TIME_OUT:
            console.log('Message wfh get error', newMessage);
            break;
          // case ErrorSocketType.NOT_ESTABLISHED:
          //   this.messageQueue.addMessage(newMessage);
          //   break;
          default:
            console.log('error send wfh', error, newMessage);
            break;
        }
      }
      if (!sent) return;
      if (isSendQuiz && sent?.message_id) {
        if (botPing) {
          userdb.last_bot_message_id = sent?.message_id;
          userdb.botPing = true;
        } else {
          userdb.last_bot_message_id = sent?.message_id;
        }
      }

      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({
          last_bot_message_id: userdb.last_bot_message_id,
          botPing: userdb.botPing,
        })
        .where(`"userId" = :userId`, { userId: userdb.userId })
        .execute();
      return sent;
    } catch (error) {
      const userDb = await this.userRepository
        .createQueryBuilder()
        .where('"userId" = :userId and deactive IS NOT True ', {
          userId,
        })
        .select('*')
        .getRawOne()
        .catch(console.error);

      const message = `KOMU không gửi được tin nhắn cho @${userDb.email}. Hãy ping #admin-username để được hỗ trợ nhé!!!`;

      const messageItAdmin = `KOMU không gửi được tin nhắn cho @${userDb.email}. #admin-username hỗ trợ nhé!!!`;

      await Promise.all([this.sendErrorToDev(messageItAdmin)]);

      return null;
    }
  };

  async sendErrorToAdmin(
    message: string,
    channelId: string,
    start: number,
    mentions: any[] = [],
  ) {
    const userAdmin = await this.userRepository
      .createQueryBuilder()
      .where('"userId" = :userId', {
        userId: '1827994776956309504',
      })
      .select('*')
      .getRawOne();
    if (!userAdmin) return;
    message = message.replace('#admin-username', `@${userAdmin.username}`);
    const findChannel = await this.channelRepository.findOne({
      where: { channel_id: channelId },
    });
    const isThread =
      findChannel?.channel_type === ChannelType.CHANNEL_TYPE_THREAD ||
      (findChannel?.parent_id !== '0' && findChannel?.parent_id !== '');
    const replyMessage = {
      clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
      channel_id: channelId,
      is_public: findChannel ? !findChannel?.channel_private : false,
      is_parent_public: true,
      parent_id: '0',
      mode: isThread
        ? EMessageMode.THREAD_MESSAGE
        : EMessageMode.CHANNEL_MESSAGE,
      msg: {
        t: message,
      },
      mentions: [
        ...mentions,
        {
          user_id: process.env.KOMUBOTREST_ADMIN_USER_ID,
          s: start,
          e: userAdmin.username.length + 1,
        },
      ],
    };
    this.messageQueue.addMessage(replyMessage);
  }

  sendErrorToDev(message) {
    const messageToUser: ReplyMezonMessage = {
      userId: '1827994776956309504',
      textContent: message,
    };
    this.messageQueue.addMessage(messageToUser);
  }
}
