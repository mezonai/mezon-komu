import { Injectable, Logger } from '@nestjs/common';
import { UtilsService } from '../services/utils.services';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientConfigService } from '../config/client-config.service';
import { BirthDay, User, Workout } from '../models';
import { BotGateway } from '../events/bot.gateway';
import { CronJob } from 'cron';
import { AxiosClientService } from '../services/axiosClient.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MezonClient } from 'mezon-sdk';
import { EMessageMode, EUserType } from '../constants/configs';
import { TimeSheetService } from '../services/timesheet.services';
import { MessageQueue } from '../services/messageQueue.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class SendMessageSchedulerService {
  private readonly logger = new Logger(BotGateway.name);
  private client: MezonClient;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(BirthDay)
    private birthdayRepository: Repository<BirthDay>,
    private clientConfigService: ClientConfigService,
    private axiosClientService: AxiosClientService,
    private clientService: MezonClientService,
    private utilsService: UtilsService,
    private timeSheetService: TimeSheetService,
    private messageQueue: MessageQueue,
  ) {
    this.client = this.clientService.getClient();
  }

  addCronJob(name: string, time: string, callback: () => void): void {
    const job = new CronJob(
      time,
      () => {
        this.logger.warn(`time (${time}) for job ${name} to run!`);
        callback();
      },
      null,
      true,
      'Asia/Ho_Chi_Minh',
    );

    this.schedulerRegistry.addCronJob(name, job);
    job.start();

    this.logger.warn(`job ${name} added for each minute at ${time} seconds!`);
  }

  // Start cron job
  startCronJobs(): void {
    this.addCronJob('happyBirthday', '00 09 * * 0-6', () =>
      this.happyBirthday(),
    );
    this.addCronJob('remindCheckout', '00 18 * * 1-5', () =>
      this.remindCheckout(),
    );
    this.addCronJob('sendMessTurnOffPc', '30 17 * * 1-5', () =>
      this.sendMessTurnOffPc(),
    );
    this.addCronJob('sendSubmitTimesheet', '00 12 * * 0', () =>
      this.sendSubmitTimesheet(),
    );
    this.addCronJob('remindDailyMorning', '00 9 * * 1-5', () =>
      this.remindDaily('morning'),
    );
    this.addCronJob('remindDailyAfternoon', '00 13 * * 1-5', () =>
      this.remindDaily('afternoon'),
    );
    this.addCronJob('remindDailyLastChance', '55 16 * * 1-5', () =>
      this.remindDaily('last'),
    );
  }

  async sendSubmitTimesheet() {
    try {
      const getListUserLogTimesheet = await this.axiosClientService.get(
        this.clientConfigService.submitTimesheet
          .api_url_getListUserLogTimesheet,
        { httpsAgent: this.clientConfigService.https },
      );
      if (!getListUserLogTimesheet) return;

      const results = getListUserLogTimesheet?.data?.result;

      await Promise.all(
        results.map(async (item) => {
          const list = await this.utilsService.getUserNameByEmail(
            item.emailAddress,
          );

          const checkUser = await this.userRepository
            .createQueryBuilder()
            .where(`"email" = :email`, { email: list })
            .andWhere(`"deactive" IS NOT TRUE`)
            .andWhere('"user_type" = :userType', { userType: EUserType.MEZON })
            .select('*')
            .execute();
          if (!checkUser) return;
          await Promise.all(
            checkUser.map(async (user) => {
              try {
                const messageToUser: ReplyMezonMessage = {
                  userId: user.userId,
                  textContent:
                    'Nhớ submit timesheet cuối tuần tránh bị phạt bạn nhé!!! Nếu bạn có tham gia opentalk bạn hãy log timesheet vào project company activities nhé.',
                };
                this.messageQueue.addMessage(messageToUser);
                // await this.client.sendMessageUser(
                //   user.userId,
                //   'Nhớ submit timesheet cuối tuần tránh bị phạt bạn nhé!!! Nếu bạn có tham gia opentalk bạn hãy log timesheet vào project company activities nhé.',
                // );
              } catch (error) {
                console.log('checkUser', error);
              }
            }),
          );
        }),
      );
    } catch (error) {
      console.log(error);
    }
  }

  async birthdayUser() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const { data } = await this.axiosClientService.get(
      `${this.clientConfigService.birthday.api_url}?month=${month}&day=${day}`,
      {
        httpsAgent: this.clientConfigService.https,
        headers: {
          'X-Secret-Key': this.clientConfigService.wfhApiKey,
        },
      },
    );
    const result = [];

    await Promise.all(
      data.result.map(async (item) => {
        const birthday = await this.userRepository
          .createQueryBuilder()
          .where('"email" = :email', {
            email: item.email.slice(0, -9),
          })
          .andWhere('"deactive" IS NOT TRUE')
          .andWhere('"user_type" = :userType', { userType: EUserType.MEZON })
          .select('*')
          .getRawOne();
        if (!birthday) return;
        const resultBirthday = await this.birthdayRepository.find();
        const items = resultBirthday.map((item) => item.title);
        let wishes = items;
        if (!wishes?.length) wishes = items;
        const index = Math.floor(Math.random() * items?.length);
        const birthdayWish = wishes[index];
        wishes.splice(index, 1);
        result.push({ user: birthday, wish: birthdayWish });
      }),
    );
    return result;
  }

  async happyBirthday() {
    const result = await this.birthdayUser();
    await Promise.all(
      result.map(async (item) => {
        if (!item?.user?.userId) return;
        const userName =
          item?.user?.clan_nick ||
          item?.user?.display_name ||
          item?.user?.username;
        const replyMessage = {
          clan_id: this.clientConfigService.clandNccId,
          channel_id: this.clientConfigService.mezonNhaCuaChungChannelId,
          is_public: false,
          is_parent_public: true,
          parent_id: '0',
          mode: EMessageMode.CHANNEL_MESSAGE,
          msg: {
            t: item.wish + ' ' + userName + ' +1 trà sữa full topping nhé b iu',
          },
          mentions: [
            {
              user_id: item?.user?.userId,
              s: item.wish?.length + 1,
              e: item.wish?.length + 1 + userName?.length,
            },
          ],
        };
        this.messageQueue.addMessage(replyMessage);
      }),
    );
  }

  async sendMessTurnOffPc() {
    if (await this.utilsService.checkHoliday()) return;
    try {
      const listsUser = await this.axiosClientService.get(
        this.clientConfigService.checkout.api_url,
        {
          httpsAgent: this.clientConfigService.https,
          headers: {
            'X-Secret-Key': `${this.clientConfigService.komubotRestSecretKey}`,
          },
        },
      );
      const { userOffFullday } = await this.utilsService.getUserOffWork(null);

      await Promise.all(
        listsUser.data.map(async (user) => {
          const query = this.userRepository
            .createQueryBuilder()
            .where('"email" = :email OR "username" = :username', {
              email: user.komuUserName,
              username: user.komuUserName,
            })
            .andWhere('"deactive" IS NOT TRUE')
            .andWhere('"user_type" = :userType', { userType: EUserType.MEZON });
          if (userOffFullday && userOffFullday?.length > 0) {
            query.andWhere('"email" NOT IN (:...userOffFullday)', {
              userOffFullday: userOffFullday,
            });
          }

          const checkUser = await query.select('*').getRawOne();
          if (checkUser && checkUser.userId) {
            const messageToUser: ReplyMezonMessage = {
              userId: checkUser.userId,
              textContent:
                'Nhớ tắt máy trước khi ra về nếu không dùng nữa nhé!!!',
            };
            this.messageQueue.addMessage(messageToUser);
            // await this.client.sendMessageUser(
            //   checkUser.userId,
            //   'Nhớ tắt máy trước khi ra về nếu không dùng nữa nhé!!!',
            // );
          }
        }),
      );
    } catch (error) {
      console.error('Error in sendMessTurnOffPc:', error);
    }
  }

  async remindCheckout() {
    if (await this.utilsService.checkHoliday()) return;
    try {
      const listsUser = await this.axiosClientService.get(
        this.clientConfigService.checkout.api_url,
        {
          httpsAgent: this.clientConfigService.https,
          headers: {
            'X-Secret-Key': `${this.clientConfigService.komubotRestSecretKey}`,
          },
        },
      );
      const userListNotCheckOut = listsUser.data.filter(
        (user) => user.checkout === null,
      );
      const { userOffFullday } = await this.utilsService.getUserOffWork(null);

      await Promise.all(
        userListNotCheckOut.map(async (user) => {
          const query = this.userRepository
            .createQueryBuilder('user')
            .where(
              'user.email = :komuUserName OR user.username = :komuUserName',
              {
                komuUserName: user.komuUserName,
              },
            )
            .andWhere('user.user_type = :userType', {
              userType: EUserType.MEZON,
            })
            .andWhere('user.deactive IS NOT TRUE');
          if (userOffFullday && userOffFullday?.length > 0) {
            query.andWhere('user.email NOT IN (:...userOffFullday)', {
              userOffFullday,
            });
          }

          const checkUser = await query.select('user').getOne();
          if (checkUser?.userId) {
            const messageToUser: ReplyMezonMessage = {
              userId: checkUser.userId,
              textContent: 'Đừng quên checkout trước khi ra về nhé!!!',
            };
            this.messageQueue.addMessage(messageToUser);
            // await this.client.sendMessageUser(
            //   checkUser.userId,
            //   'Đừng quên checkout trước khi ra về nhé!!!',
            // );
          }
        }),
      );
    } catch (error) {
      console.error('Error in remindCheckout:', error);
    }
  }

  async remindDaily(type) {
    if (await this.utilsService.checkHoliday()) return;

    try {
      const { notDailyMorning, notDailyAfternoon, notDailyFullday } =
        await this.timeSheetService.getUserNotDaily(null);

      let userNotDaily = [...notDailyAfternoon, ...notDailyFullday];
      if (type === 'morning') {
        userNotDaily = [...notDailyMorning, ...notDailyFullday];
      }

      await Promise.all(
        userNotDaily.map(async (username) => {
          try {
            const userdb = await this.userRepository
              .createQueryBuilder('user')
              .where(
                '(user.email = :username OR user.username = :username) AND user.deactive IS NOT TRUE AND user.user_type = :userType',
                {
                  username,
                  userType: EUserType.MEZON,
                },
              )
              .getOne();

            if (userdb) {
              const messageToUser: ReplyMezonMessage = {
                userId: userdb.userId,
                textContent:
                  type === 'last'
                    ? '[WARNING] Five minutes until lost 20k because of missing DAILY. Thanks!'
                    : "Don't forget to daily, dude! Don't be mad at me, we are friends I mean we are best friends.",
              };
              this.messageQueue.addMessage(messageToUser);
              // await this.client.sendMessageUser(
              //   userdb.userId,
              //   type === 'last'
              //     ? '[WARNING] Five minutes until lost 20k because of missing DAILY. Thanks!'
              //     : "Don't forget to daily, dude! Don't be mad at me, we are friends I mean we are best friends.",
              // );
            }
          } catch (error) {
            console.error(error);
          }
        }),
      );
    } catch (error) {
      console.log(error);
    }
  }
}
