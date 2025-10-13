import { Injectable, Logger } from '@nestjs/common';
import { MezonClient } from 'mezon-sdk';
import { MezonClientConfig } from '../dtos/MezonClientConfig';
import {
  ReactMessageChannel,
  ReplyMezonMessage,
} from 'src/bot/asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class MezonClientService {
  private readonly logger = new Logger(MezonClientService.name);
  private client: MezonClient;
  public token: string;

  constructor(clientConfigs: MezonClientConfig) {
    this.client = new MezonClient({
      botId: '1826067167154540544',
      token: clientConfigs.token,
    });
  }

  getToken() {
    return this.token;
  }

  async initializeClient() {
    try {
      const result = await this.client.login();
      this.logger.log('authenticated.', result);
      const data = JSON.parse(result);
      this.token = data?.token;
    } catch (error) {
      this.logger.error('error authenticating.', error);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  async sendMessage(replyMessage: ReplyMezonMessage) {
    try {
      const channel = await this.client.channels.fetch(replyMessage.channel_id);
      if (replyMessage?.ref?.length && replyMessage?.message_id) {
        const message = await channel.messages.fetch(replyMessage.message_id);
        return await message.reply(
          replyMessage.msg,
          replyMessage.mentions,
          replyMessage.attachments,
          replyMessage.mention_everyone,
          replyMessage.anonymous_message,
          replyMessage.topic_id,
          replyMessage.code,
        );
      }
      return await channel.send(
        replyMessage.msg,
        replyMessage.mentions,
        replyMessage.attachments,
        replyMessage.mention_everyone,
        replyMessage.anonymous_message,
        replyMessage.topic_id,
        replyMessage.code,
      );
    } catch (error) {
      throw error;
    }
  }

  async sendMessageToUser(messageToUser: ReplyMezonMessage) {
    const dmClan = await this.client.clans.fetch('0');
    const user = await dmClan.users.fetch(messageToUser.userId);
    try {
      return await user.sendDM({
        t: messageToUser.textContent,
        ...messageToUser.messOptions,
      });
    } catch (error) {
      throw error;
    }
  }

  async createDMchannel(userId: string) {
    try {
      return await this.client.createDMchannel(userId);
    } catch (error) {
      console.log('createDMchannel', error);
    }
  }

  async reactMessageChannel(dataReact: ReactMessageChannel) {
    const channel = await this.client.channels.fetch(dataReact.channel_id);
    const message = await channel.messages.fetch(dataReact.message_id);
    const dataSend = {
      emoji_id: dataReact.emoji_id,
      emoji: dataReact.emoji,
      count: dataReact.count,
    };
    try {
      return await message.react(dataSend);
    } catch (error) {
      console.log('reactMessageChannel', error);
      return null;
    }
  }
}
