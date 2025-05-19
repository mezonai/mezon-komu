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
import { MezonClient } from 'mezon-sdk';
@Injectable()
export class MessageCommand {
  private client: MezonClient;
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
    this.client = this.clientService.getClient();
  }

  private handleCommandMessage() {
    setInterval(async () => {
      if (this.messageQueue.hasMessages()) {
        const message = this.messageQueue.getNextMessage();
        if (message) {
          try {
            if (message.userId) {
              const clan = await this.client.clans.fetch(
                process.env.KOMUBOTREST_CLAN_NCC_ID,
              );
              console.log('message.userId', message.userId);
              try {
                const user = await clan.users.fetch(message.userId);
                if (!user) return;
                console.log('useruseruser', user.id);
                await user.sendDM({
                  t: message.textContent,
                  ...message.messOptions,
                });
              } catch (error) {
                await this.userRepository.update(
                  { userId: message.userId },
                  { botPing: false },
                );
                console.log('Error fetch user', message.userId);
              }
            } else {
              await this.clientService.sendMessage(message);
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
                console.log('error send', message, error);
                break;
            }
          }
        }
      }
    }, 50);
  }
}
