import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/bot/models';
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
    if (args[0] === 'up') {
      if (message.sender_id !== '1827994776956309504') return;
      const userId = args[1];
      const min = +args[2];
      await this.voiceSessionTrackingService.adjustUserVoiceSessionTime(userId, min, UpdateTimeType.UP);
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
      if (message.sender_id !== '1827994776956309504') return;
      const userId = args[1];
      const min = +args[2];
      await this.voiceSessionTrackingService.adjustUserVoiceSessionTime(userId, min, UpdateTimeType.DOWN);
      const messageContent = `Giảm ${min} success! ${userId}`;
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    return
  }
}
