import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MezonBotMessage } from '../models';
import { PollService } from '../services/poll.service';

@Injectable()
export class PollSchedulerService {
  constructor(
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    private pollService: PollService,
  ) {}

  private readonly logger = new Logger(PollSchedulerService.name);

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleResultPollExpire() {
    this.logger.warn(
      `time ${CronExpression.EVERY_MINUTE} for job handleResultPollExpire to run!`,
    );
    const currentTimestamp = Date.now();
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    const timestampMinus12Hours = new Date(+currentTimestamp - twelveHoursInMs);

    const findMessagePoll = await this.mezonBotMessageRepository.findOne({
      where: { createAt: LessThan(+timestampMinus12Hours), deleted: false },
    });
    if (!findMessagePoll) return;
    this.pollService.handleResultPoll(findMessagePoll);
  }
}
