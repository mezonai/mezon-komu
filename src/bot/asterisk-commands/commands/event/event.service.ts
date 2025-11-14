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
  async checkEvent(
    title,
    users,
    createdTimestamp,
    channel_id,
    attachment,
    note,
  ) {
    return await this.eventRepository.findOne({
      where: {
        title,
        users,
        createdTimestamp,
        channelId: channel_id,
        attachment,
        cancel: false,
        note,
      },
    });
  }

  async saveEvent(
    title,
    createdTimestamp,
    users,
    channel_id,
    attachment,
    note,
  ) {
    const checkEvent = await this.checkEvent(
      title,
      users,
      createdTimestamp,
      channel_id,
      attachment,
      note,
    );
    if (!checkEvent) {
      return await this.eventRepository.insert({
        title,
        createdTimestamp,
        users,
        channelId: channel_id,
        attachment,
        note,
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
      .createQueryBuilder('u')
      .where(
        `(u.clan_nick = :email AND u.user_type = :type)
       OR (u.username = :email AND u.user_type = :type)`,
        {
          email,
          type: EUserType.MEZON,
        },
      )
      .orderBy('u.clan_nick = :email', 'DESC')
      .setParameter('email', email)
      .getOne();
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
    note,
  ) {
    const textAttachment = `${attachment ?? ''}`;
    userMentions.map(async (item) => {
      const usernameFilter = [
        item.clan_nick || item.username,
        message.clan_nick || message.username,
      ];
      const usernameList = userMentions
        .filter(
          (user) => !usernameFilter.includes(user.clan_nick || user.username),
        )
        .map((user) => `@${user.clan_nick || user.username}`)
        .join(', ');

      const textNoNote = `[EVENT] You have an event "${title}" with @${message.username}, ${usernameList} on ${checkDate} in ${checkTime}\n${note && 'Note: '}`;
      const textContent = textNoNote + `${note}\n`;
      const mk = [];
      if (attachment)
        mk.push({
          type: 'lk',
          s: textContent.length,
          e: textContent.length + textAttachment.length,
        });

      if (note?.startsWith('http'))
        mk.push({
          type: 'lk',
          s: textNoNote.length,
          e: textNoNote.length + note.length,
        });

      const messageToUser: ReplyMezonMessage = {
        userId: item.userId,
        textContent: textContent + (attachment ? textAttachment : ''),
        messOptions: { mk },
      };
      this.messageQueue.addMessage(messageToUser);
    });

    const usernameList = userMentions
      .filter((user) => user.username !== message.username)
      .map((user) => `@${user.clan_nick || user.username}`)
      .join(', ');

    const textNoNote = `[EVENT] You have an event "${title}" with ${usernameList} on ${checkDate} in ${checkTime}\n${note && `Note: `}`;
    const textContent = textNoNote + `${note}\n`;
    const mk = [
      {
        type: 'b',
        s: 0,
        e: 7,
      },
    ];
    if (attachment)
      mk.push({
        type: 'lk',
        s: textContent.length,
        e: textContent.length + textAttachment.length,
      });

    if (note?.startsWith('http'))
      mk.push({
        type: 'lk',
        s: textNoNote.length,
        e: textNoNote.length + note.length,
      });
    const messageToUser: ReplyMezonMessage = {
      userId: message.sender_id,
      textContent: textContent + (attachment ? textAttachment : ''),
      messOptions: { mk },
    };
    this.messageQueue.addMessage(messageToUser);
  }
}
