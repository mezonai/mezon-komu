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
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const sevenDays = new Date(+currentTimestamp - sevenDaysInMs);

    const findMessagePolls = await this.mezonBotMessageRepository.find({
      where: { createAt: LessThan(+sevenDays), deleted: false },
    });
    if (!findMessagePolls?.length) return;
    findMessagePolls.map((findMessagePoll) => {
      this.pollService.handleResultPoll(findMessagePoll);
    });
  }
}
