import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { User } from 'src/bot/models';
import { EventEntity } from 'src/bot/models/event.entity';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { Repository } from 'typeorm';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private messageQueue: MessageQueue,
  ) {}

  async getListEvent(channel_id) {
    return await this.eventRepository
      .createQueryBuilder('event')
      .where(`"channelId" = :channelId`, { channelId: channel_id })
      .andWhere(`"cancel" IS NOT true`)
      .select(`event.*`)
      .execute();
  }
  async checkEvent(title, users, createdTimestamp, channel_id, attachment) {
    return await this.eventRepository.findOne({
      where: {
        title,
        users,
        createdTimestamp,
        channelId: channel_id,
        attachment,
        cancel: false,
      },
    });
  }

  async saveEvent(title, createdTimestamp, users, channel_id, attachment) {
    const checkEvent = await this.checkEvent(
      title,
      users,
      createdTimestamp,
      channel_id,
      attachment,
    );
    if (!checkEvent) {
      return await this.eventRepository.insert({
        title,
        createdTimestamp,
        users,
        channelId: channel_id,
        attachment,
      });
    }
  }

  async cancelEventById(id) {
    return await this.eventRepository
      .createQueryBuilder('event')
      .update(EventEntity)
      .set({
        cancel: true,
      })
      .where(`"id" = :id`, { id: id })
      .execute();
  }

  async getDataUser(email) {
    return await this.userRepository
      .createQueryBuilder()
      .where(
        `("email" = :email or "username" = :username) and "user_type" = :userType`,
        { email, username: email, userType: EUserType.MEZON },
      )
      .select('*')
      .getRawOne();
  }

  async getDataUserById(id) {
    return await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :id`, { id })
      .select('*')
      .getRawOne();
  }

  async notiCreateEvent(
    userMentions,
    message,
    checkDate,
    checkTime,
    attachment,
    title,
  ) {
    const textAttachment = `${attachment ?? ''}`;
    userMentions.map(async (item) => {
      const usernameFilter = [item.username, message.username];
      const usernameList = userMentions
        .filter((user) => !usernameFilter.includes(user.username))
        .map((user) => `@${user.username}`)
        .join(', ');
      const textContent = `You have an event "${title}" with @${message.username}, ${usernameList} on ${checkDate} in ${checkTime}\n`;

      const messageToUser: ReplyMezonMessage = {
        userId: item.userId,
        textContent: textContent + (attachment ? textAttachment : ''),
        messOptions: attachment
          ? {
              lk: [
                {
                  s: textContent.length,
                  e: textContent.length + textAttachment.length,
                },
              ],
            }
          : null,
      };
      this.messageQueue.addMessage(messageToUser);
    });

    const usernameList = userMentions
      .filter((user) => user.username !== message.username)
      .map((user) => `@${user.username}`)
      .join(', ');
    const textContent = `You have an event "${title}" with ${usernameList} on ${checkDate} in ${checkTime}\n`;
    const messageToUser: ReplyMezonMessage = {
      userId: message.sender_id,
      textContent: textContent + (attachment ? textAttachment : ''),
      messOptions: attachment
        ? {
            lk: [
              {
                s: textContent.length,
                e: textContent.length + textAttachment.length,
              },
            ],
          }
        : null,
    };
    this.messageQueue.addMessage(messageToUser);
  }
}
