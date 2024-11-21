import { InjectRepository } from '@nestjs/typeorm';
import { WorkFromHome } from 'src/bot/models/wfh.entity';
import { Between, In, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import moment from 'moment';
import https from 'https';
import { UtilsService } from './utils.services';
import { TimeSheetService } from './timesheet.services';
import { AxiosClientService } from './axiosClient.services';
import { ClientConfigService } from '../config/client-config.service';
import { MezonTrackerStreaming, User } from '../models';
import { getUserNameByEmail } from '../utils/helper';

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
    private timeSheetService: TimeSheetService,
  ) {}

  messTrackerHelp =
    '```' +
    '*report tracker daily' +
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
    '```';

  messHelpDaily = '```' + 'Không có bản ghi nào trong ngày hôm qua' + '```';
  messHelpWeekly = '```' + 'Không có bản ghi nào trong tuần qua' + '```';
  messHelpDate = '```' + 'Không có bản ghi nào trong ngày này' + '```';
  messHelpTime = '```' + 'Không có bản ghi nào' + '```';

  async reportTracker(args) {
    try {
      const result = await this.axiosClientService.get(
        `http://tracker.komu.vn:5600/api/0/report?day=${args[1]}`,
        {
          headers: {
            'X-Secret-Key': this.clientConfigService.komuTrackerApiKey,
          },
        },
      );
      const { wfhUsers } = await this.getUserWFH(args);
      const usersOffWork = await this.getUserOffWork(args);

      if (!wfhUsers) {
        return [];
      }
      const { data } = result;
      function processUserWfhs(data, wfhUsers, usersOffWork) {
        const userWfhs = [];

        for (const user of data) {
          const matchingWfhUser = wfhUsers.find(
            (wfhUser) => wfhUser.emailAddress == user.email.concat('@ncc.asia'),
          );

          if (matchingWfhUser) {
            user.dateTypeName = matchingWfhUser.dateTypeName;
            userWfhs.push(user);

            const matchingOffWorkUser = usersOffWork.find(
              (offWorkUser) =>
                offWorkUser.emailAddress == user.email.concat('@ncc.asia'),
            );

            user.offWork =
              matchingOffWorkUser?.message
                ?.replace(/\[.*?\]\s*Off\s+/, '')
                .trim() || '';
          }
        }

        return userWfhs;
      }

      const userWfhs = processUserWfhs(data, wfhUsers, usersOffWork);

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
        `[Danh sách tracker ngày ${args[1] ?? 'hôm nay'} tổng là ${userWfhs.length - 1} người] \n\n${mess}`,
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

  async reportTrackerNot(args) {
    try {
      const result = await this.axiosClientService.get(
        `http://tracker.komu.vn:5600/api/0/report?day=${args[1]}`,
        {
          headers: {
            'X-Secret-Key': this.clientConfigService.komuTrackerApiKey,
          },
        },
      );
      const { wfhUsers } = await this.getUserWFH(args);

      if (!wfhUsers) {
        return [];
      }

      const { data } = result;
      const userWfhs = [];
      for (const e of data) {
        for (const wfhUser of wfhUsers) {
          if (e.email.concat('@ncc.asia') == wfhUser.emailAddress) {
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
        const match = userWfhs[i].str_active_time.match(regex);
        const totalSeconds =
          parseInt(match[1]) * 3600 +
          parseInt(match[2]) * 60 +
          parseInt(match[3]);
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
        for (const e of usersOffWork) {
          if (user.email.concat('@ncc.asia') == e.emailAddress) {
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
        `[Danh sách tracker không đủ thời gian ngày ${args[1] ?? 'hôm nay'} tổng là ${listTrackerNot.length - 1} người] \n\n${messRep}`,
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
    let formatDate;
    if (args[1]) {
      const day = args[1].slice(0, 2);
      const month = args[1].slice(3, 5);
      const year = args[1].slice(6);
      formatDate = `${month}/${day}/${year}`;
    }
    const fridayTimestamp = formatDate
      ? new Date(formatDate).getTime()
      : this.getFriday();

    const now = new Date();
    const timestampNcc8 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      9,
      0,
    ).getTime();

    //get user wfh id
    const wfhResult = await this.timeSheetService.findWFHUser();
    const wfhUserEmail = wfhResult
      .filter((item) => ['Morning', 'Fullday'].includes(item.dateTypeName))
      .map((item) => {
        return getUserNameByEmail(item.emailAddress);
      });

    const finUser = await this.userRepository.find({
      where: { username: In(wfhUserEmail) },
    });

    const userIdWfhList = finUser.map((user) => user.userId);

    // get data tracker
    const findUser = await this.mezonTrackerStreamingRepository.find({
      where: {
        joinAt: Between(fridayTimestamp - 86400000, fridayTimestamp + 86400000),
      },
    });
    if (!findUser.length) {
      console.log('NODATA');
      return;
    }
    const sortedFindUser = findUser.sort((a, b) => a.joinAt - b.joinAt);
    const userTracking = sortedFindUser.reduce((acc, curr) => {
      const existingUser = acc.find((item) => item.userId === curr.userId);

      if (existingUser) {
        existingUser.joinAt.push(curr.joinAt);
        existingUser.leaveAt.push(curr.leaveAt);
      } else {
        acc.push({
          userId: curr.userId,
          joinAt: [curr.joinAt],
          leaveAt: [curr.leaveAt],
        });
      }
      return acc;
    }, []);
    const textToday = formatDate
      ? `ngày ${formatDate}`
      : now.getDay() === 4
        ? 'hôm nay'
        : 'thứ 6 tuần trước';
    const lateTextArray = [];
    const timeTextArray = [];
    const fifteenMinutes = 15 * 60 * 1000;
    const userIdJoinNcc8 = [];
    await Promise.all(
      userTracking.map(async (user) => {
        userIdJoinNcc8.push(user.userId);
        const findUser = await this.userRepository.findOne({
          where: { userId: user.userId },
        });

        // check join not enough time
        let totalJoinTime = 0;
        user.joinAt.map((time, index) => {
          totalJoinTime += user.leaveAt[index] - time;
        });

        if (totalJoinTime < fifteenMinutes) {
          const totalTimeInSeconds = Math.round(totalJoinTime / 1000);
          const totalTimeInMinutes = Math.round(totalTimeInSeconds / 60);
          const remainingTime = fifteenMinutes - totalJoinTime;
          const remainingTimeInSeconds = Math.round(remainingTime / 1000);
          const remainingTimeInMinutes = Math.round(
            remainingTimeInSeconds / 60,
          );

          timeTextArray.push(
            `${findUser.username} - join tổng: ${
              totalTimeInSeconds < 60
                ? `${totalTimeInSeconds} giây`
                : `${totalTimeInMinutes} phút`
            } -> thiếu ${
              remainingTimeInSeconds < 60
                ? `${remainingTimeInSeconds} giây`
                : `${remainingTimeInMinutes} phút`
            }`,
          );
        }

        // check join late
        const fisrtTimeJoined = user.joinAt[0];
        if (fisrtTimeJoined > timestampNcc8) {
          const timelate = (fisrtTimeJoined - timestampNcc8) / 1000;
          const dateTime = this.utilsService.formatDate(
            new Date(Number(fisrtTimeJoined)),
            true,
          );
          lateTextArray.push(
            `${findUser.username} - join lần đầu lúc ${dateTime} -> Vào muộn ${timelate > 60 ? `${Math.round(timelate / 60)} phút` : `${Math.round(timelate)} giây`}`,
          );
        }
      }),
    );

    const userIdNotJoin = userIdWfhList.filter(
      (id) => !userIdJoinNcc8.includes(id),
    );
    const userNotJoin = await Promise.all(
      userIdNotJoin.map(async (id) => {
        const findUser = await this.userRepository.findOne({
          where: { userId: id },
        });
        if (!findUser) return;
        return findUser.username;
      }),
    );
    if (userNotJoin.length) {
      userNotJoin.unshift(`Những người KHÔNG THAM GIA NCC8 ${textToday}`);
    }
    if (lateTextArray.length) {
      lateTextArray.unshift(`Những người join NCC8 MUỘN ${textToday}`);
    }
    if (timeTextArray.length) {
      timeTextArray.unshift(
        `Những người join NCC8 KHÔNG ĐỦ 15 PHÚT ${textToday}`,
      );
    }
    return { lateTextArray, timeTextArray, userNotJoin };
  }
}
