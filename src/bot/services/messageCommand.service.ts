import { Injectable } from '@nestjs/common';
import { MessageQueue } from './messageQueue.service';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { MezonBotMessage, User } from '../models';
import { KomuService } from './komu.services';
import { PollService } from './poll.service';
import { ReactMessageChannel } from '../asterisk-commands/dto/replyMessage.dto';
@Injectable()
export class MessageCommand {
  constructor(
    private readonly messageQueue: MessageQueue,
    private clientService: MezonClientService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    private komuService: KomuService,
    private pollService: PollService,
  ) {
    this.handleCommandMessage();
  }

  private handleCommandMessage() {
    setInterval(async () => {
      if (this.messageQueue.hasMessages()) {
        const message = this.messageQueue.getNextMessage();
        if (message) {
          try {
            if (message.userId) {
              const { userId, ...option } = message;
              const channelDm = await this.channelDmMezonRepository.findOne({
                where: { user_id: userId },
              }); // find DM channel in db
              if (!channelDm) {
                const findUser = await this.userRepository.findOne({
                  where: { userId: userId },
                });

                const newDMChannel =
                  await this.clientService.createDMchannel(userId); // create new DM channel
                if (!newDMChannel || !findUser) return;
                const dataInsert = {
                  user_id: userId,
                  channel_id: newDMChannel.channel_id,
                  username: findUser?.username,
                };
                await this.channelDmMezonRepository.insert(dataInsert);
                const newMessage = {
                  ...option,
                  channelDmId: newDMChannel.channel_id,
                };
                await this.clientService.sendMessageToUser(newMessage);
              } else {
                const newMessage = {
                  ...option,
                  channelDmId: channelDm.channel_id,
                };
                await this.clientService.sendMessageToUser(newMessage);
              }
            } else {
              const messageSent = await this.clientService.sendMessage(message);
              if (
                message.msg.t.startsWith('```[Poll]') &&
                messageSent.message_id
              ) {
                const dataMezonBotMessage = {
                  messageId: messageSent.message_id,
                  userId: message.sender_id,
                  channelId: message.channel_id,
                  content: message.msg.t + '',
                  createAt: Date.now(),
                  pollResult: [],
                };
                await this.mezonBotMessageRepository.insert(
                  dataMezonBotMessage,
                );
                const options = this.pollService.getOptionPoll(message.msg.t);
                options.push('checked');
                options.forEach(async (option, index) => {
                  const listEmoji = this.pollService.getEmojiDefault();
                  const dataReact: ReactMessageChannel = {
                    clan_id: message.clan_id,
                    channel_id: message.channel_id,
                    is_public: message.is_public,
                    is_parent_public: message.is_parent_public,
                    message_id: messageSent.message_id,
                    emoji_id:
                      option === 'checked'
                        ? listEmoji[option]
                        : listEmoji[index + 1 + ''],
                    emoji: option === 'checked' ? option : index + '',
                    count: 1,
                    mode: message.mode,
                    message_sender_id: process.env.BOT_KOMU_ID,
                  };
                  await this.clientService.reactMessageChannel(dataReact);
                });
              }
            }
          } catch (error) {
            this.komuService.sendErrorToDev(
              `send message error: ${JSON.stringify(message)}`,
            );
          }
        }
      }
    }, 200);
  }
}
