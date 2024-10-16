import { Injectable, Logger } from '@nestjs/common';
import { ApiMessageAttachment, ApiMessageRef, MezonClient } from 'mezon-sdk';
import { MezonClientConfig } from '../dtos/MezonClientConfig';
import {
  ReactMessageChannel,
  ReplyMezonMessage,
} from 'src/bot/asterisk-commands/dto/replyMessage.dto';
import { EMessageMode } from 'src/bot/constants/configs';

@Injectable()
export class MezonClientService {
  private readonly logger = new Logger(MezonClientService.name);
  private client: MezonClient;

  constructor(clientConfigs: MezonClientConfig) {
    this.client = new MezonClient(clientConfigs.token);
  }

  async initializeClient() {
    try {
      const result = await this.client.authenticate();
      this.logger.log('authenticated.', result);
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
      return await this.client.sendMessage(
        replyMessage.clan_id,
        replyMessage.channel_id,
        replyMessage.mode,
        replyMessage.is_public,
        replyMessage.msg,
        replyMessage.mentions,
        replyMessage.attachments,
        replyMessage.ref,
      );
    } catch (error) {
      console.log('sendMessage', error);
    }
  }

  async sendMessageToUser(messageToUser: ReplyMezonMessage) {
    try {
      return await this.client.sendDMChannelMessage(
        messageToUser.channelDmId,
        messageToUser.textContent ?? '',
        messageToUser.messOptions ?? {},
        messageToUser.attachments ?? [],
        messageToUser.refs ?? [],
      );
    } catch (error) {
      console.log('sendMessageToUser', error);
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
    try {
      return await this.client.reactionMessage(
        '',
        dataReact.clan_id,
        dataReact.channel_id,
        EMessageMode.CHANNEL_MESSAGE,
        dataReact.is_public,
        dataReact.message_id,
        dataReact.emoji_id,
        dataReact.emoji,
        dataReact.count,
        dataReact.message_sender_id,
        false,
      );
    } catch (error) {
      console.log('reactMessageChannel', error);
    }
  }
}
