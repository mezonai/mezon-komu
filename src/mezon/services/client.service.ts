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

  async enrichHg(hg: any[]): Promise<any[]> {
    if (!Array.isArray(hg) || !hg.length) return hg;
    await Promise.all(
      hg.map(async (item) => {
        if (!item || typeof item !== 'object' || !item.channelId) return;
        const needsClanId = !item.clanId;
        const needsLabel =
          item.channelLabel === undefined ||
          item.channelLabel === null ||
          item.channelLabel === '';
        const needsType =
          item.channelType === undefined || item.channelType === null;
        if (needsClanId || needsLabel || needsType) {
          try {
            const ch = await this.client.channels
              .fetch(item.channelId)
              .catch(() => null);
            if (ch) {
              if (needsClanId)
                item.clanId = ch.clan?.id || (ch as any)?.clan_id || '';
              if (needsLabel)
                item.channelLabel = ch.name || (ch as any)?.channel_label || '';
              if (needsType)
                item.channelType = ch.channel_type ?? (ch as any)?.type ?? 0;
            }
          } catch (_) {}
        }
      }),
    );
    return hg;
  }

  async sendMessage(replyMessage: ReplyMezonMessage) {
    try {
      if (replyMessage?.msg?.hg) {
        await this.enrichHg(replyMessage.msg.hg);
      }
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
    const user = await this.client.users.fetch(messageToUser.userId);
    try {
      if (messageToUser?.messOptions?.hg) {
        await this.enrichHg(messageToUser.messOptions.hg);
      }
      return await user.sendDM({
        t: messageToUser.textContent,
        ...messageToUser.messOptions,
      });
    } catch (error) {
      throw error;
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
