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
import { ErrorSocketType } from '../constants/configs';
@Injectable()
export class MessageCommand {
  constructor(
    private readonly messageQueue: MessageQueue,
    private clientService: MezonClientService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
              if (messageSent) {
                this.pollService.handelReactPollMessage(message, messageSent);
              }
            }
          } catch (error) {
            switch (error) {
              case ErrorSocketType.TIME_OUT:
                console.log('Message get error', message);
                break;
              case ErrorSocketType.NOT_ESTABLISHED:
                this.messageQueue.addMessage(message);
                break;
              default:
                console.log('error send', error);
                break;
            }
          }
        }
      }
    }, 50);
  }
}
