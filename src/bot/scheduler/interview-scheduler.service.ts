import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EMessageComponentType, EUserType } from 'src/bot/constants/configs';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { InterviewerReply, User } from 'src/bot/models';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { KomuService } from 'src/bot/services/komu.services';
import { EButtonMessageStyle } from 'mezon-sdk';
import { getRandomColor } from 'src/bot/utils/helper';
import { CronJob } from 'cron';
import moment from 'moment-timezone';
import { ReplyMezonMessage } from 'src/bot/asterisk-commands/dto/replyMessage.dto';
import { v4 as uuidv4 } from 'uuid';
import { ClientConfigService } from 'src/bot/config/client-config.service';

@Injectable()
export class InterviewSchedulerService {
  private readonly logger = new Logger(InterviewSchedulerService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private messageQueue: MessageQueue,
    private axiosClientService: AxiosClientService,
    private komubotrestService: KomuService,
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(InterviewerReply)
    private interviewRepository: Repository<InterviewerReply>,
    private clientConfigService: ClientConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleInterviewReply() {
    try {
      const interviewReplies = await this.interviewRepository.find({
        where: { isReply: false },
      });

      interviewReplies.forEach(async (interviewReply) => {
        const now = moment().tz('Asia/Ho_Chi_Minh');
        const messageTime = moment(interviewReply.timeSendMessage).tz(
          'Asia/Ho_Chi_Minh',
        );

        const interviewUser = await this.userRepository.findOne({
          where: {
            username: interviewReply.hrEmailProcess.split('@')[0],
            user_type: EUserType.MEZON,
          },
        });
        const userId = interviewUser.userId;
        if (now.isAfter(messageTime.clone().add(5, 'minutes'))) {
          const textContent = `${interviewReply.interviewerName} không trả lời tin nhắn tham gia phỏng vấn.`;
          const messageToUser: ReplyMezonMessage = {
            userId,
            textContent,
            messOptions: {
              mk: [
                { type: 'b', s: 0, e: interviewReply.interviewerName.length },
              ],
            },
          };
          this.messageQueue.addMessage(messageToUser);
          this.interviewRepository
            .createQueryBuilder()
            .update(InterviewerReply)
            .set({ isReply: true })
            .where(`"id" = :id`, {
              id: interviewReply.id,
            })
            .execute();
        }
      });
    } catch (error) {
      this.logger.error('Failed to fetch interview reply:', error);
    }
  }

  @Cron('0 8,13 * * 1-5', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async scheduleInterviews() {
    const urlGetInterviews = `${this.clientConfigService.talentURL}Public/GetInterviewInfo`;
    try {
      const responseTasks = await this.axiosClientService.get(
        urlGetInterviews,
        {
          headers: {
            securityCode: process.env.SECURITY_CODE,
            accept: 'application/json',
            'x-secret-key': process.env.TALENT_X_SECRET_KEY,
          },
        },
      );

      const interviews = responseTasks.data.result?.interviewInfo;
      if (!interviews?.length) {
        this.logger.warn('No interviews found.');
        return;
      }

      interviews.forEach((interview) => {
        this.scheduleInterviewReminder(interview);
      });
    } catch (error) {
      this.logger.error('Failed to fetch interview schedule:', error);
    }
  }

  scheduleInterviewReminder(interview) {
    const interviewTime = moment.tz(
      interview.timeInterview,
      'Asia/Ho_Chi_Minh',
    );
    const reminderTime = interviewTime.clone().subtract(30, 'minutes');

    if (reminderTime.isBefore(moment().tz('Asia/Ho_Chi_Minh'))) {
      this.logger.warn(
        `Skipping past interview for ${interview.interviewer?.interviewerName}`,
      );
      return;
    }

    const cronTime = `${reminderTime.minute()} ${reminderTime.hour()} * * *`;
    const jobName = `interview_${interview.interviewer?.id}`;

    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.logger.warn(`Skipping duplicate cron job for ${jobName}`);
      return;
    }

    this.addCronJob(jobName, cronTime, () =>
      this.sendInterviewReminder(interview),
    );

    this.logger.log(
      `Scheduled interview reminder for ${interview.interviewer?.interviewerName} at ${reminderTime.format('YYYY-MM-DD HH:mm:ss')}`,
    );
  }

  async sendInterviewReminder(interviewInfo) {
    const interviewUser = await this.userRepository.findOne({
      where: {
        username: interviewInfo.interviewer.interviewerEmail.split('@')[0],
        user_type: EUserType.MEZON,
      },
    });
    const userId = interviewUser.userId;
    const botPing = true;
    const interviewTimeLocal = moment.tz(
      interviewInfo.timeInterview,
      'Asia/Ho_Chi_Minh',
    );

    const interviewTimeLocalFormat = interviewTimeLocal.format(
      'DD/MM/YYYY HH:mm:ss',
    );

    const interviewId = uuidv4();

    const buttons = [
      {
        type: EMessageComponentType.BUTTON,
        id: `interview_${interviewId}_${interviewInfo.interviewer.interviewerName}_${interviewInfo.hrEmail}_${interviewTimeLocalFormat}_btnAccept`,
        component: { label: 'Có', style: EButtonMessageStyle.PRIMARY },
      },
      {
        type: EMessageComponentType.BUTTON,
        id: `interview_${interviewId}_${interviewInfo.interviewer.interviewerName}_${interviewInfo.hrEmail}_${interviewTimeLocalFormat}_btnReject`,
        component: { label: 'Không', style: EButtonMessageStyle.PRIMARY },
      },
    ];

    const embed = [
      {
        color: getRandomColor(),
        title: '📢 Thông báo lịch phỏng vấn',
        description:
          '```' +
          `\nBạn có lịch phỏng vấn lúc ${interviewTimeLocalFormat}, bạn có thể tham gia không?` +
          '```' +
          '\n(Trả lời bằng cách chọn đáp án bên dưới)',
      },
    ];

    await this.komubotrestService.sendMessageKomuToUser(
      '',
      userId,
      botPing,
      false,
      [{ components: buttons }],
      embed,
    );
    const interviewerReply = this.interviewRepository.create({
      id: interviewId,
      interviewerId: userId,
      interviewerName: interviewInfo.interviewer.interviewerName,
      interviewerEmail: interviewInfo.interviewer.interviewerEmail,
      hrEmailProcess: interviewInfo.hrEmail,
      timeSendMessage: moment().format('YYYY-MM-DD HH:mm:ss'),
      isReply: false,
    });
    await this.interviewRepository.save(interviewerReply);

    this.logger.log(
      `Sent interview reminder to ${interviewInfo.interviewer?.interviewerName} for ${interviewTimeLocal.format('YYYY-MM-DD HH:mm:ss')}`,
    );
  }

  addCronJob(name: string, cronTime: string, callback: () => void): void {
    const job = new CronJob(
      cronTime,
      () => {
        this.logger.log(`Running job: ${name} at ${cronTime}`);
        callback();
      },
      null,
      true,
      'Asia/Ho_Chi_Minh',
    );

    this.schedulerRegistry.addCronJob(name, job);
    job.start();

    this.logger.log(`Added cron job: ${name} at ${cronTime}`);
  }
}
