import { InjectRepository } from '@nestjs/typeorm';
import { WorkFromHome } from 'src/bot/models/wfh.entity';
import { Between, In, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import moment from 'moment-timezone';
import https from 'https';
import { UtilsService } from './utils.services';
import { TimeSheetService } from './timesheet.services';
import { AxiosClientService } from './axiosClient.services';
import { ClientConfigService } from '../config/client-config.service';
import { MezonTrackerStreaming, User, UserClanProfile } from '../models';
import { getUserNameByEmail } from '../utils/helper';
import { EUserType } from '../constants/configs';
import { Ncc8ScheduleConfigService } from './ncc8ScheduleConfig.service';
import {
  nccProfileDisplayNameSql,
  nccProfileIdentifierSql,
  nccProfileMatchesListSql,
} from '../utils/user-clan-profile';

@Injectable()
export class ReportTrackerService {
  constructor(
    private utilsService: UtilsService,
    private readonly axiosClientService: AxiosClientService,
    private clientConfigService: ClientConfigService,
    @InjectRepository(MezonTrackerStreaming)
    private mezonTrackerStreamingRepository: Repository<MezonTrackerStreaming>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserClanProfile)
    private userClanProfileRepository: Repository<UserClanProfile>,
    private timeSheetService: TimeSheetService,
    private ncc8ScheduleConfigService: Ncc8ScheduleConfigService,
  ) { }

  messTrackerHelp =
    '' +
    'Command *report tracker daily' +
    '\n' +
    '*report tracker daily a.nguyenvan' +
    '\n' +
    '*report tracker weekly' +
    '\n' +
    '*report tracker weekly a.nguyenvan' +
    '\n' +
    '*report tracker time' +
    '\n' +
    '*report tracker time a.nguyenvan' +
    '\n' +
    '*report tracker dd/MM/YYYY' +
    '\n' +
    '*report tracker dd/MM/YYYY a.nguyenvan' +
    '';

  messHelpDaily = '' + 'Không có bản ghi nào trong ngày hôm qua' + '';
  messHelpWeekly = '' + 'Không có bản ghi nào trong tuần qua' + '';
  messHelpDate = '' + 'Không có bản ghi nào trong ngày này' + '';
  messHelpTime = '' + 'Không có bản ghi nào' + '';

  formatTrackerDate(dayInput?: any): string {
    let dayStr: any = dayInput;

    if (Array.isArray(dayInput)) {
      dayStr = dayInput[1] ?? dayInput[0];
    } else if (typeof dayInput === 'object' && dayInput !== null) {
      dayStr = dayInput.date ?? dayInput.day;
    }

    if (!dayStr || typeof dayStr !== 'string') {
      return moment().format('YYYY-MM-DD');
    }

    dayStr = dayStr.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
      return dayStr;
    }

    const ddmmyyyy = moment(dayStr, 'DD/MM/YYYY', true);
    if (ddmmyyyy.isValid()) {
      return ddmmyyyy.format('YYYY-MM-DD');
    }

    const parsed = moment(
      dayStr,
      ['YYYY/MM/DD', 'DD-MM-YYYY', 'MM/DD/YYYY'],
      true,
    );
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }

    const loose = moment(dayStr);
    if (loose.isValid()) {
      return loose.format('YYYY-MM-DD');
    }

    return moment().format('YYYY-MM-DD');
  }

  private async getTrackerProfileMap(
    data: any[],
  ): Promise<Map<string, string>> {
    const mezonIds = Array.from(
      new Set(data.map((x) => x.mezonId).filter(Boolean)),
    );

    if (!mezonIds.length) {
      return new Map();
    }

    const profiles = await this.userClanProfileRepository
      .createQueryBuilder('ncc_profile')
      .where('ncc_profile.clan_id = :nccClanId', {
        nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID,
      })
      .andWhere('ncc_profile.userId IN (:...mezonIds)', { mezonIds })
      .select([
        'ncc_profile.userId AS "userId"',
        'ncc_profile.clan_nick AS "clan_nick"',
        'ncc_profile.username AS "username"',
      ])
      .getRawMany<{
        userId: string;
        clan_nick: string;
        username: string;
      }>();

    const profileByMezonId = new Map<string, string>();
    for (const p of profiles) {
      const name = (p.clan_nick && p.clan_nick.trim()) || p.username;
      if (name) {
        profileByMezonId.set(p.userId, name);
      }
    }

    return profileByMezonId;
  }

  async reportTracker(args, returnMsg = true) {
    try {
      const dateFormatted = this.formatTrackerDate(args);
      const result = await this.axiosClientService.get(
        `https://tracker.komu.vn/api/0/reports/users?day=${dateFormatted}`,
        {
          headers: {
            'X-API-Key': this.clientConfigService.komuTrackerApiKey,
          },
        },
      );
      const { wfhUsers } = await this.getUserWFH(args);
      const usersOffWork = await this.getUserOffWork(args);

      if (!wfhUsers) {
        return [];
      }
      const { data } = result;
      if (!Array.isArray(data) || !data.length) {
        return returnMsg ? [this.messHelpTime] : [];
      }

      const profileByMezonId = await this.getTrackerProfileMap(data);

      const dataConverted = data.map((item) => {
        const profileIdentifier =
          (item.mezonId && profileByMezonId.get(item.mezonId)) ||
          item.name ||
          item.email?.replace(/@ncc\.asia$/, '') ||
          item.email;
        const emailAddress = item.email?.includes('@')
          ? item.email.toLowerCase()
          : `${item.email}@ncc.asia`.toLowerCase();

        return {
          ...item,
          userEmailAddress: emailAddress,
          email: profileIdentifier,
          str_active_time: item.active_time || '00:00:00',
        };
      });

      function processUserWfhs(data, wfhUsers, usersOffWork) {
        const userWfhs = [];

        for (const user of data) {
          const matchingWfhUser = wfhUsers.find(
            (wfhUser) =>
              wfhUser.emailAddress?.toLowerCase() === user.userEmailAddress,
          );

          if (matchingWfhUser) {
            user.dateTypeName = matchingWfhUser.dateTypeName;
            userWfhs.push(user);

            const matchingOffWorkUser = usersOffWork?.find(
              (offWorkUser) =>
                offWorkUser.emailAddress?.toLowerCase() ===
                user.userEmailAddress,
            );

            user.offWork =
              matchingOffWorkUser?.message
                ?.replace(/\[.*?\]\s*Off\s+/, '')
                .trim() || '';
          }
        }

        return userWfhs;
      }

      const userWfhs = processUserWfhs(dataConverted, wfhUsers, usersOffWork);

      if (!returnMsg) {
        return userWfhs;
      }

      if (!userWfhs.length) {
        return [this.messHelpTime];
      }

      const pad =
        userWfhs.reduce(
          (a, b) => (a < b.email.length ? b.email.length : a),
          0,
        ) + 2;
      userWfhs.unshift({
        email: '[email]',
        str_active_time: '[active]',
        dateTypeName: '[remote]',
        offWork: '[off_work]',
      });
      let mess = userWfhs
        .map(
          (e) =>
            `${e.email.padEnd(pad)} ${e.str_active_time.padEnd(10)} ${e.dateTypeName.padEnd(11)} ${e.offWork}`,
        )
        .join('\n');

      const parts = this.splitMessage(
        `[Danh sách tracker ngày ${args?.[1] ?? 'hôm nay'} tổng là ${userWfhs.length - 1} người] \n\n${mess}`,
        2000,
      );
      const listMessage = [];
      for (const part of parts) {
        listMessage.push(part);
      }
      return listMessage;
    } catch (error) {
      console.log(error);
    }
  }

  async reportTrackerList(args) {
    try {
      const dateFormatted = this.formatTrackerDate(args);
      const result = await this.axiosClientService.get(
        `https://tracker.komu.vn/api/0/reports/users?day=${dateFormatted}`,
        {
          headers: {
            'X-API-Key': this.clientConfigService.komuTrackerApiKey,
          },
        },
      );

      const { data } = result;
      if (!Array.isArray(data) || !data.length) {
        return [];
      }

      const profileByMezonId = await this.getTrackerProfileMap(data);

      const dataConverted = data.map((item) => {
        const profileIdentifier =
          (item.mezonId && profileByMezonId.get(item.mezonId)) ||
          item.name ||
          item.email?.replace(/@ncc\.asia$/, '') ||
          item.email;

        return {
          spent_time: item.active_time,
          email: profileIdentifier,
        };
      });
      return dataConverted;
    } catch (error) {
      console.log(error);
    }
  }

  async getUserWFH(args) {
    let wfhGetApi;
    let wfhUsers;
    let url;
    try {
      if (args[1]) {
        console.log('args[1]', args[1], Date.now());
        const format = this.utilsService.formatDayMonth(args[1]);
        url = `${this.clientConfigService.wfh.api_url}?date=${format}`;
      } else {
        url = this.clientConfigService.wfh.api_url;
      }
      wfhGetApi = await this.axiosClientService.get(url, {
        httpsAgent: this.clientConfigService.https,
        headers: {
          // WFH_API_KEY_SECRET
          securitycode: this.clientConfigService.wfhApiKey,
        },
      });
    } catch (error) {
      console.log(error);
    }

    if (!wfhGetApi || wfhGetApi.data == undefined) {
      return;
    }

    const wfhUserEmail = wfhGetApi.data.result.map((item) =>
      this.utilsService.getUserNameByEmail(item.emailAddress),
    );
    wfhUsers = wfhGetApi.data.result;

    if (
      (Array.isArray(wfhUserEmail) && wfhUserEmail.length === 0) ||
      !wfhUserEmail
    ) {
      return;
    }

    return { wfhUserEmail, wfhUsers };
  }

  async getUserOffWork(args) {
    let usersOffWork;
    let url;
    try {
      if (args[1]) {
        const format = this.utilsService.formatDayMonth(args[1]);
        url = `https://timesheetapi.nccsoft.vn/api/services/app/Public/GetAllUserLeaveDay?date=${format}`;
      } else {
        url =
          'https://timesheetapi.nccsoft.vn/api/services/app/Public/GetAllUserLeaveDay';
      }
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await this.axiosClientService.get(url, { httpsAgent });
      if (response.data.result) {
        usersOffWork = response.data.result.filter((user) => user.dayType == 4);
      }
    } catch (error) {
      console.log(error);
    }

    return usersOffWork;
  }

  splitMessage(message, maxLength) {
    const parts = [];
    while (message.length > maxLength) {
      let part = message.slice(0, maxLength);
      const lastNewline = part.lastIndexOf('\n');
      if (lastNewline !== -1) {
        part = part.slice(0, lastNewline + 1);
      }
      parts.push(part);
      message = message.slice(part.length);
    }

    parts.push(message);
    return parts;
  }

  async reportTrackerNot(args, returnMsg = true) {
    try {
      const dateFormatted = this.formatTrackerDate(args);
      const result = await this.axiosClientService.get(
        `https://tracker.komu.vn/api/0/reports/users?day=${dateFormatted}`,
        {
          headers: {
            'X-API-Key': this.clientConfigService.komuTrackerApiKey,
          },
        },
      );
      const { wfhUsers } = await this.getUserWFH(args);

      if (!wfhUsers) {
        return [];
      }

      const { data } = result;
      if (!Array.isArray(data) || !data.length) {
        return [];
      }

      const profileByMezonId = await this.getTrackerProfileMap(data);

      const output = data.map((item) => {
        const profileName =
          (item.mezonId && profileByMezonId.get(item.mezonId)) ||
          item.name ||
          item.email?.replace(/@ncc\.asia$/, '') ||
          item.email;
        const emailAddress = item.email?.includes('@')
          ? item.email.toLowerCase()
          : `${item.email}@ncc.asia`.toLowerCase();

        return {
          ...item,
          userEmailAddress: emailAddress,
          email: profileName,
          str_active_time: item.active_time || '00:00:00',
        };
      });

      const userWfhs = [];
      for (const e of output) {
        for (const wfhUser of wfhUsers) {
          if (e.userEmailAddress === wfhUser.emailAddress?.toLowerCase()) {
            e['dateTypeName'] = wfhUser.dateTypeName;
            userWfhs.push(e);
            break;
          }
        }
      }

      const regex = /(\d+)h(\d+)m(\d+)s/;

      //convert hour to seconds
      const secondsFullday = 7 * 3600;
      const secondsMorning = 3 * 3600;
      const secondsAfternoon = 4 * 3600;

      const listTrackerNot = [];

      for (let i = 0; i < userWfhs.length; i++) {
        let totalSeconds = 0;
        if (userWfhs[i].active_seconds !== undefined) {
          totalSeconds = Math.round(Number(userWfhs[i].active_seconds) || 0);
        } else if (userWfhs[i].str_active_time) {
          const match = userWfhs[i].str_active_time.match(regex);
          if (match) {
            totalSeconds =
              parseInt(match[1]) * 3600 +
              parseInt(match[2]) * 60 +
              parseInt(match[3]);
          } else {
            const parts = userWfhs[i].str_active_time.split(':');
            if (parts.length === 3) {
              totalSeconds =
                parseInt(parts[0]) * 3600 +
                parseInt(parts[1]) * 60 +
                parseInt(parts[2]);
            }
          }
        }

        if (
          (userWfhs[i].dateTypeName == 'Fullday' &&
            totalSeconds < secondsFullday) ||
          (userWfhs[i].dateTypeName == 'Morning' &&
            totalSeconds < secondsMorning) ||
          (userWfhs[i].dateTypeName == 'Afternoon' &&
            totalSeconds < secondsAfternoon)
        ) {
          listTrackerNot.push(userWfhs[i]);
        }
      }

      const usersOffWork = await this.getUserOffWork(args);

      for (const user of listTrackerNot) {
        for (const e of usersOffWork || []) {
          if (user.userEmailAddress === e.emailAddress?.toLowerCase()) {
            user.offWork = e?.message?.replace(/\[.*?\]\s*Off\s+/, '').trim();
            break;
          } else {
            user.offWork = '';
          }
        }
      }

      const pad =
        listTrackerNot.reduce(
          (a, b) => (a < b.email.length ? b.email.length : a),
          0,
        ) + 2;

      if (!returnMsg) {
        return listTrackerNot;
      }

      listTrackerNot.unshift({
        email: '[email]',
        str_active_time: '[active]',
        dateTypeName: '[remote]',
        offWork: '[off_work]',
      });
      const messRep = listTrackerNot
        .map(
          (e) =>
            `${e.email.padEnd(pad)} ${e.str_active_time.padEnd(10)} ${e.dateTypeName.padEnd(10)} ${e.offWork}`,
        )
        .join('\n');
      const parts = this.splitMessage(
        `[Danh sách tracker không đủ thời gian ngày ${args?.[1] ?? 'hôm nay'} tổng là ${listTrackerNot.length - 1} người] \n\n${messRep}`,
        2000,
      );
      const listMessage = [];
      for (const part of parts) {
        listMessage.push(part);
      }
      return listMessage;
    } catch (error) {
      console.log(error);
    }
  }

  prependMessage(array: string[], message: string) {
    array.unshift(message);
    if (array.length === 1) {
      array.push('(Không ai vi phạm)');
    }
  }

  getFriday() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = (dayOfWeek - 5 + 7) % 7;
    const friday = new Date(now);
    friday.setDate(now.getDate() - diff);
    const utcPlus7 = new Date(friday.getTime() + 7 * 60 * 60 * 1000);
    return utcPlus7.getTime();
  }

  async handleReportJoinNcc8(args) {
    const reportDate = args[1]
      ? moment.tz(args[1], 'DD/MM/YYYY', 'Asia/Ho_Chi_Minh')
      : this.ncc8ScheduleConfigService.getLatestEnabledDate();
    const reportStart = reportDate.clone().startOf('day').valueOf();
    const reportEnd = reportDate.clone().endOf('day').valueOf();
    const timestampNcc8 = reportDate
      .clone()
      .hour(11)
      .minute(30)
      .second(0)
      .millisecond(0)
      .valueOf();

    //get user wfh id
    const wfhResult = await this.timeSheetService.findWFHUser(
      reportDate.clone().hour(12).valueOf(),
    );
    const wfhUserEmail = wfhResult
      .filter((item) => ['Morning', 'Fullday'].includes(item.dateTypeName))
      .map((item) => getUserNameByEmail(item.emailAddress));
    const findUserWfh = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        'komu_user_clan_profile',
        'ncc_profile',
        'ncc_profile."userId" = "user"."userId" AND ncc_profile.clan_id = :nccClanId',
        { nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID },
      )
      .where(nccProfileMatchesListSql('wfhUserEmail'), { wfhUserEmail })
      .andWhere('"user".user_type = :userType', { userType: EUserType.MEZON })
      .andWhere('"user".deactive = :deactive', { deactive: false })
      .getMany();

    const userIdWfhList = findUserWfh.map((user) => user.userId);
    // get data tracker
    const findUserTracker = await this.mezonTrackerStreamingRepository.find({
      where: {
        joinAt: Between(reportStart, reportEnd),
        channelId: process.env.MEZON_NCC8_CHANNEL_ID,
      },
    });
    const userSessionMap = new Map<
      string,
      { totalTime: number; firstJoin: number | null }
    >();

    for (const session of findUserTracker) {
      if (!session.userId || session.leaveAt === null) continue;

      const timeSpent = session.leaveAt - session.joinAt;
      const prev = userSessionMap.get(session.userId);

      if (prev) {
        userSessionMap.set(session.userId, {
          totalTime: prev.totalTime + timeSpent,
          firstJoin: Math.min(prev.firstJoin ?? session.joinAt, session.joinAt),
        });
      } else {
        userSessionMap.set(session.userId, {
          totalTime: timeSpent,
          firstJoin: session.joinAt,
        });
      }
    }

    const userIdJoinNcc8: string[] = [];
    const lateTextArray: string[] = [];
    const timeTextArray: string[] = [];
    const fifteenMinutes = 15 * 60 * 1000;

    for (const [userId, session] of userSessionMap.entries()) {
      const findUser = await this.userRepository
        .createQueryBuilder('user')
        .leftJoin(
          'komu_user_clan_profile',
          'ncc_profile',
          'ncc_profile."userId" = "user"."userId" AND ncc_profile.clan_id = :nccClanId',
          { nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID },
        )
        .where('"user"."userId" = :userId', { userId })
        .andWhere('"user".user_type = :userType', { userType: EUserType.MEZON })
        .select([
          '"user"."userId" AS "userId"',
          `${nccProfileDisplayNameSql()} AS "profileName"`,
        ])
        .getRawOne<{ userId: string; profileName: string }>();
      if (!findUser) continue;

      userIdJoinNcc8.push(userId);
      // check total time
      if (session.totalTime < fifteenMinutes) {
        const totalTimeInMinutes = Math.round(session.totalTime / 60000);
        const remainingTimeInMinutes = Math.round(
          (fifteenMinutes - session.totalTime) / 60000,
        );

        timeTextArray.push(
          `${findUser.profileName} - tham gia tổng ${totalTimeInMinutes} phút -> thiếu ${remainingTimeInMinutes} phút`,
        );
      }

      // check join late
      if (session.firstJoin && session.firstJoin > timestampNcc8) {
        const lateSeconds = (session.firstJoin - timestampNcc8) / 1000;
        if (lateSeconds > 120) {
          const lateText =
            lateSeconds > 60
              ? `${Math.round(lateSeconds / 60)} phút`
              : `${Math.round(lateSeconds)} giây`;

          const timeString = this.utilsService.formatDate(
            session.firstJoin,
            true,
          );

          lateTextArray.push(
            `${findUser.profileName} - join lúc ${timeString} → vào muộn ${lateText}`,
          );
        }
      }
    }

    const userIdNotJoin = userIdWfhList.filter(
      (id) => !userIdJoinNcc8.includes(id),
    );
    const userNotJoin = await Promise.all(
      userIdNotJoin.map(async (id) => {
        const user = await this.userRepository
          .createQueryBuilder('user')
          .leftJoin(
            'komu_user_clan_profile',
            'ncc_profile',
            'ncc_profile."userId" = "user"."userId" AND ncc_profile.clan_id = :nccClanId',
            { nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID },
          )
          .where('"user"."userId" = :userId', { userId: id })
          .andWhere('"user".user_type = :userType', { userType: EUserType.MEZON })
          .select(`${nccProfileDisplayNameSql()} AS "profileName"`)
          .getRawOne<{ profileName: string }>();
        return user?.profileName;
      }),
    );

    const now = moment.tz('Asia/Ho_Chi_Minh');
    const textToday = args[1]
      ? `ngày ${args[1]}`
      : reportDate.isSame(now, 'day')
        ? 'hôm nay'
        : `${this.ncc8ScheduleConfigService.formatWeekday(reportDate.day())} gần nhất`;
    this.prependMessage(
      userNotJoin,
      `Những người KHÔNG THAM GIA NCC8 ${textToday}`,
    );
    this.prependMessage(
      lateTextArray,
      `Những người join NCC8 MUỘN ${textToday}`,
    );
    this.prependMessage(
      timeTextArray,
      `Những người join NCC8 KHÔNG ĐỦ 15 PHÚT ${textToday}`,
    );

    return { lateTextArray, timeTextArray, userNotJoin };
  }
}
