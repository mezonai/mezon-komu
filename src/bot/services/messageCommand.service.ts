import { Injectable } from '@nestjs/common';
import { MessageQueue } from './messageQueue.service';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { User } from '../models';
import { PollService } from './poll.service';
import { ErrorSocketType } from '../constants/configs';
import { MezonClient } from 'mezon-sdk';
import { AsyncThrottleQueue } from '../utils/asyncThrottleQueue';

@Injectable()
export class MessageCommand {
  private client: MezonClient;
  private throttleQueue = new AsyncThrottleQueue(45);

  constructor(
    private readonly messageQueue: MessageQueue,
    private clientService: MezonClientService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private pollService: PollService,
  ) {
    this.client = this.clientService.getClient();
    this.handleCommandMessage();
  }

  private handleCommandMessage() {
    setInterval(() => {
      while (this.messageQueue.hasMessages() && this.throttleQueue) {
        const message = this.messageQueue.getNextMessage();
        if (message) {
          this.throttleQueue.enqueue(() => this.sendMessage(message));
        } else {
          break;
        }
      }
    }, 50);
  }

  private async sendMessage(message) {
    try {
      if (message.userId) {
        try {
          const user = await this.client.users.fetch(message.userId);
          if (!user) return;
          await user.sendDM(
            {
              t: message?.textContent ?? '',
              ...(message?.messOptions ?? {}),
            },
            message?.code,
          );
        } catch (error) {
          const user = await this.client.users?.fetch('1827994776956309504')
          user.sendDM({t: `Không fetch đc user ${message.userId}`})
          // await this.userRepository.update(
          //   { userId: message.userId },
          //   { botPing: false, user_type: null },
          // );
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

