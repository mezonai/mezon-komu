import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiUrl } from 'src/bot/constants/api_url';
import { EUserType } from 'src/bot/constants/configs';
import { Daily, User } from 'src/bot/models';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { TimeSheetService } from 'src/bot/services/timesheet.services';
import { getDateDay, getUserNameByEmail } from 'src/bot/utils/helper';
import { Repository } from 'typeorm';

@Injectable()
export class ReportDailyService {
  constructor(
    private readonly axiosClientService: AxiosClientService,
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Daily) private dailyRepository: Repository<Daily>,
    private timeSheetService: TimeSheetService,
  ) {}
  findCountNotDaily(arr, email) {
    const users = arr.find((item) => item.email === email);
    return users ? users.count : 1;
  }
  async reportDaily(date) {
    const { notDaily, userNotDaily } = await this.getUserNotDaily(date);

    let mess;
    const dateString = (date && date.toDateString()) || '';
    const dailyString = date
      ? 'Những Người Chưa Daily'
      : 'Những Người Chưa Daily Hôm Nay';

    if (!userNotDaily) {
      return;
    } else if (Array.isArray(userNotDaily) && userNotDaily.length === 0) {
      mess = [dateString + 'Tất Cả Đều Đã Daily'];
      return mess;
    } else {
      const messes = [];
      for (let i = 0; i <= Math.ceil(userNotDaily.length / 50); i += 1) {
        if (userNotDaily.slice(i * 50, (i + 1) * 50).length === 0) break;
        mess = userNotDaily
          .slice(i * 50, (i + 1) * 50)
          .filter((user) => user)
          .filter((user) => user.username)
          .map((user) => {
            if (user.userId) {
              return `${user.email.toLowerCase()} (${this.findCountNotDaily(
                notDaily,
                user.username,
              )})`;
            } else {
              return `${user.email.toLowerCase()} (${this.findCountNotDaily(
                notDaily,
                user.username,
              )})`;
            }
          })
          .join('\n');
        messes.push(`${dailyString} \n${mess}`);
      }
      return messes;
    }
  }

  async getUserNotDaily(date: Date) {
    if (
      date &&
      (date.getDay() === 0 || date.getDay() === 6 || date > new Date())
    ) {
      return {
        notDaily: [],
        userNotDaily: [],
        notDailyMorning: [],
        notDailyFullday: [],
        notDailyAfternoon: [],
      };
    }

    const url = `${ApiUrl.WFHApi.api_url}${date ? `?date=${date.toDateString()}` : ''}`;
    const wfhGetApi = await this.axiosClientService.get(url, {
      headers: {
        // WFH_API_KEY_SECRET
        securitycode: this.configService.get<string>('WFH_API_KEY_SECRET'),
      },
    });
    if (
      wfhGetApi.status != 200 ||
      !wfhGetApi.data?.result ||
      wfhGetApi.data.result.length == 0
    ) {
      return;
    }

    const wfhUserEmail = wfhGetApi.data.result.map((item) =>
      getUserNameByEmail(item.emailAddress),
    );

    const [wfhMorning, wfhAfternoon, wfhFullday] = [
      'Morning',
      'Afternoon',
      'Fullday',
    ].map((value) =>
      wfhGetApi.data.result
        .filter((item) => item.dateTypeName === value)
        .map((item) => getUserNameByEmail(item.emailAddress)),
    );

    // if no wfh
    if (wfhUserEmail.length === 0) {
      return;
    }

    const { userOffFullday } = await this.timeSheetService.getUserOffWork(date);
    const userOff = [...wfhUserEmail, ...userOffFullday];
    const userNotWFH = await this.userRepository
      .createQueryBuilder('user')
      .where(
        userOff && userOff.length
          ? 'LOWER("email") NOT IN (:...userOff)'
          : 'true',
        {
          userOff: userOff,
        },
      )
      .andWhere('("createdAt" < :today OR "createdAt" is NULL)', {
        today: Date.now() - 86400 * 1000,
      })
      .andWhere('"userId" != :userId', { userId: process.env.BOT_KOMU_ID })
      .andWhere('"user_type" = :userType', {
        userType: EUserType.MEZON.toString(),
      })
      .andWhere(`"deactive" IS NOT TRUE`)
      .select('*')
      .execute();

    const userEmail = userNotWFH.map((item) => item.email);

    const [dailyEmailMorning, dailyEmailAfternoon, dailyEmailFullday] =
      await Promise.all(
        [
          {
            gtecreatedAt: getDateDay(date).morning.fisttime,
            ltecreatedAt: getDateDay(date).morning.lastime,
          },
          {
            gtecreatedAt: getDateDay(date).afternoon.fisttime,
            ltecreatedAt: getDateDay(date).afternoon.lastime,
          },
          {
            gtecreatedAt: getDateDay(date).fullday.fisttime,
            ltecreatedAt: getDateDay(date).fullday.lastime,
          },
        ].map((item) =>
          this.dailyRepository
            .createQueryBuilder()
            .where(`"createdAt" >= :gtecreatedAt`, {
              gtecreatedAt: item.gtecreatedAt,
            })
            .andWhere(`"createdAt" <= :ltecreatedAt`, {
              ltecreatedAt: item.ltecreatedAt,
            })
            .select('*')
            .execute(),
        ),
      ).then((results) =>
        results.map((result) => result.map((item) => item.email.toLowerCase())),
      );

    const notDailyMorning = [];
    for (const wfhData of wfhUserEmail) {
      if (wfhMorning.includes(wfhData) || wfhFullday.includes(wfhData)) {
        if (
          !dailyEmailMorning.includes(wfhData.toLowerCase()) &&
          wfhData !== undefined
        ) {
          notDailyMorning.push(wfhData);
        }
      }
    }

    const notDailyAfternoon = [];
    for (const wfhData of wfhUserEmail) {
      if (wfhAfternoon.includes(wfhData) || wfhFullday.includes(wfhData)) {
        if (
          !dailyEmailAfternoon.includes(wfhData.toLowerCase()) &&
          wfhData !== undefined
        ) {
          notDailyAfternoon.push(wfhData);
        }
      }
    }

    const notDailyFullday = [];
    for (const userNotWFHData of userEmail) {
      if (
        !dailyEmailFullday.includes(userNotWFHData.toLowerCase()) &&
        userNotWFHData !== undefined
      ) {
        notDailyFullday.push(userNotWFHData);
      }
    }

    const spreadNotDaily = [
      ...notDailyMorning,
      ...notDailyAfternoon,
      ...notDailyFullday,
    ];
    // => notDaily : {email : "", count : }
    const notDaily = spreadNotDaily.reduce((acc, cur) => {
      if (Array.isArray(acc) && acc.length === 0) {
        acc.push({ email: cur, count: 1 });
      } else {
        const indexExist = acc.findIndex((item) => item.email === cur);
        if (indexExist !== -1) {
          acc[indexExist] = {
            email: acc[indexExist].email,
            count: acc[indexExist].count + 1,
          };
        } else {
          acc.push({ email: cur, count: 1 });
        }
      }
      return acc;
    }, []);

    const dayToMilliseconds = 86400 * 1000;

    const userNotDaily = await Promise.all(
      notDaily.map((user) =>
        this.userRepository
          .createQueryBuilder('user')
          .where(`LOWER("email") = :email`, {
            email: user.email.toLowerCase(),
          })
          .orWhere(`LOWER("username") = :username`, {
            username: user.email.toLowerCase(),
          })
          .andWhere('("createdAt" < :today OR "createdAt" is NULL)', {
            today: Date.now() - dayToMilliseconds,
          })
          .andWhere('"userId" != :userId', { userId: process.env.BOT_KOMU_ID })
          .andWhere('"user_type" = :userType', {
            userType: EUserType.MEZON.toString(),
          })
          .andWhere(`"deactive" IS NOT TRUE`)
          .select('*')
          .getRawOne(),
      ),
    );

    for (let i = 0; i < userNotDaily.length; i++) {
      if (userNotDaily[i] === null) {
        userNotDaily[i] = notDaily[i];
      }
    }
    return {
      notDaily,
      userNotDaily,
      notDailyMorning,
      notDailyFullday,
      notDailyAfternoon,
    };
  }
}
