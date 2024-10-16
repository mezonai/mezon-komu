import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMessageAck, MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelMezon, User } from '../models';
import { Repository } from 'typeorm';
import { EMessageMode, EUserType } from '../constants/configs';
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
      // const user = await this.client.getDMchannel(userdb.userId);
      // if (!user) {
      //   const message = `#admin-username ơi, đồng chí ${username} không đúng format rồi!!!`;
      //   await this.sendErrorToAdmin(
      //     message,
      //     process.env.KOMUBOTREST_MACHLEO_CHANNEL_ID,
      //     0,
      //   );
      //   return null;
      // }
      // if (username == 'son.nguyenhoai') {
      let sent: ChannelMessageAck;
      try {
        const findDMChannel = await this.channelDmMezonRepository.findOne({
          where: { user_id: userdb.userId },
        });
        if (!findDMChannel) {
          const newDMChannel = await this.clientService.createDMchannel(
            userdb.userId,
          ); // create new DM channel
          if (!newDMChannel) return;
          const dataInsert = {
            user_id: userdb.userId,
            channel_id: newDMChannel.channel_id,
            username: userdb?.username,
          };
          await this.channelDmMezonRepository.insert(dataInsert);
          const newMessage = {
            textContent: '```' + msg + '```',
            messOptions: {
              mk: [{ type: 't', s: 0, e: msg.length + 6 }],
            },
            channelDmId: newDMChannel.channel_id,
          };
          sent = await this.clientService.sendMessageToUser(newMessage);
        } else {
          const newMessage = {
            textContent: '```' + msg + '```',
            messOptions: {
              mk: [{ type: 't', s: 0, e: msg.length + 6 }],
            },
            channelDmId: findDMChannel.channel_id,
          };
          sent = await this.clientService.sendMessageToUser(newMessage);
        }
      } catch (error) {
        this.sendErrorToDev(
          `send wfh error: ${error}, username: ${userdb.username}`,
        );
      }

      // msg = '```' + msg + '```';
      // const sent = await this.client.sendDMChannelMessage(userdb.userId, msg, {
      //   mk: [{ type: 't', s: 0, e: msg.length }],
      // });

      // }

      // botPing : work when bot send quiz wfh user
      //* isSendQuiz : work when bot send quiz
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

      await Promise.all([
        this.sendErrorToDev(messageItAdmin),
        // this.sendErrorToAdmin(
        //   messageItAdmin,
        //   process.env.KOMUBOTREST_ITADMIN_CHANNEL_ID,
        //   messageItAdmin.indexOf('#admin-username'),
        //   [
        //     {
        //       user_id: userDb.userId,
        //       s: messageItAdmin.indexOf(userDb.email) - 1,
        //       e: messageItAdmin.indexOf(userDb.email) + userDb.email.length,
        //     },
        //   ],
        // ),
        // this.sendErrorToAdmin(
        //   message,
        //   process.env.KOMUBOTREST_MACHLEO_CHANNEL_ID,
        //   message.indexOf('#admin-username'),
        //   [
        //     {
        //       user_id: userDb.userId,
        //       s: message.indexOf(userDb.email),
        //       e: message.indexOf(userDb.email) + userDb.email.length + 1,
        //     },
        //   ],
        // ),
      ]);

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
    const replyMessage = {
      clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
      channel_id: channelId,
      is_public: findChannel ? !findChannel?.channel_private : false,
      is_parent_public: true,
      parent_id: '0',
      mode: EMessageMode.CHANNEL_MESSAGE,
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
