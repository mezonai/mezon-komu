import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { EventMezon, User } from 'src/bot/models';
import { Repository } from 'typeorm';
import {
  OpentalkService,
  UpdateTimeType,
} from 'src/bot/services/opentalk.services';
import { VoiceSessionTrackingService } from 'src/bot/services/voiceSessionTracking.services';

@Command('opt')
export class OpentalkCommand extends CommandMessage {
  constructor(
    private voiceSessionTrackingService: VoiceSessionTrackingService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(EventMezon)
    private readonly eventRepo: Repository<EventMezon>,
  ) {
    super();
  }

  isValidDateFormat(input: string): boolean {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    return regex.test(input);
  }

  chunkArray<T>(array: T[], chunkSize: number) {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }

  async execute(args: string[], message: ChannelMessage) {
    if (message.sender_id !== '1827994776956309504') return;
    if (args[0] === 'list') {
      const events = await this.eventRepo
        .createQueryBuilder('e')
        .orderBy('e.id', 'DESC')
        .limit(15)
        .getMany();

      if (!events.length) {
        const text = 'Không có events!';
        return this.replyMessageGenerate(
          {
            messageContent: text,
            mk: [{ type: 'pre', s: 0, e: text.length }],
          },
          message,
        );
      }

      const result = events
        .map((e, i) => {
          const raw = e.timeStart;
          const time = Number(raw);
          const date = new Date(time);
          return `${i + 1}. ${e.id} | ${e.title} | ${new Date(date).toLocaleString()} | ${e.channelVoiceId ?? 'không có'} `;
        })
        .join('\n');

      return this.replyMessageGenerate(
        {
          messageContent: result,
          mk: [{ type: 'pre', s: 0, e: result.length }],
        },
        message,
      );
    }

    if (args[0] === 'up') {
      const userId = args[1];
      const min = +args[2];
      await this.voiceSessionTrackingService.adjustUserVoiceSessionTime(
        userId,
        min,
        UpdateTimeType.UP,
      );
      const messageContent = `Tăng ${min} success! ${userId}`;
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'down') {
      const userId = args[1];
      const min = +args[2];
      await this.voiceSessionTrackingService.adjustUserVoiceSessionTime(
        userId,
        min,
        UpdateTimeType.DOWN,
      );
      const messageContent = `Giảm ${min} success! ${userId}`;
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    return;
  }
}
