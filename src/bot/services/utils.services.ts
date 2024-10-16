import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { subDays } from 'date-fns';
import { Repository } from 'typeorm';
import { Holiday } from '../models/holiday.entity';
import { AxiosClientService } from './axiosClient.services';
import { MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ClientConfigService } from '../config/client-config.service';
import { KomuService } from './komu.services';

const timeUTC = 60000 * 60 * 7;
@Injectable()
export class UtilsService {
  private client: MezonClient;
  constructor(
    @InjectRepository(Holiday)
    private holidayRepository: Repository<Holiday>,
    private axiosClientService: AxiosClientService,
    private clientService: MezonClientService,
    private clientConfigService: ClientConfigService,
    private komuService: KomuService,
  ) {
    this.client = this.clientService.getClient();
  }

  getYesterdayDate() {
    return subDays(new Date().setHours(23, 59, 59, 999), 1).getTime() - timeUTC;
  }

  getTomorrowDate() {
    return subDays(new Date().setHours(0, 0, 0, 0), -1).getTime() - timeUTC;
  }

  setTime(date, hours, minutes = 0, seconds = 0, ms = 0) {
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, seconds, ms);
    return newDate;
  }

  checkTimeSchedulerNCC8() {
    const currentTime = new Date();
    const timezoneOffset = currentTime.getTimezoneOffset() / -60;
    const currentDay = currentTime.getDay();

    const firstTime = this.setTime(
      currentTime,
      6 + timezoneOffset,
      15,
    ).getTime();
    const lastTime = this.setTime(
      currentTime,
      7 + timezoneOffset,
      15,
    ).getTime();

    return (
      currentDay === 5 &&
      currentTime.getTime() >= firstTime &&
      currentTime.getTime() <= lastTime
    );
  }

  padTo2Digits(num) {
    return num.toString().padStart(2, '0');
  }

  checkNumber = (string) =>
    !isNaN(parseFloat(string)) && !isNaN(string - 0) && parseInt(string);

  async checkHoliday() {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-GB');

    const holidays = await this.holidayRepository.find({
      where: { dateTime: formattedDate },
    });

    return holidays.length > 0;
  }

  checkTimeMeeting() {
    const dateTimeNow = new Date();
    const timeZoneOffset = dateTimeNow.getTimezoneOffset();
    // check UTC
    if (timeZoneOffset !== -420) {
      dateTimeNow.setHours(
        dateTimeNow.getHours() + (420 + timeZoneOffset) / 60, // set UTC+7
      );
    }
    let day = dateTimeNow.getDay();
    const hourDateNow = dateTimeNow.getHours();
    const dateNow = dateTimeNow.toLocaleDateString('en-US');
    const minuteDateNow = dateTimeNow.getMinutes();
    dateTimeNow.setHours(0, 0, 0, 0);

    return {
      day,
      dateTimeNow,
      hourDateNow,
      dateNow,
      minuteDateNow,
    };
  }

  isSameDate(dateCreatedTimestamp) {
    const { dateNow } = this.checkTimeMeeting();
    return dateNow === dateCreatedTimestamp;
  }

  isSameDay() {
    const { day } = this.checkTimeMeeting();
    return day === 0 || day === 6;
  }

  isSameMinute(minuteDb, dateScheduler, channelId?) {
    const { minuteDateNow, hourDateNow } = this.checkTimeMeeting();
    let checkFiveMinute;
    let hourTimestamp;

    if (minuteDb >= 0 && minuteDb <= 4) {
      checkFiveMinute = minuteDb + 60 - minuteDateNow;
      dateScheduler.setHours(dateScheduler.getHours() - 1);
      hourTimestamp = dateScheduler.getHours();
    } else {
      checkFiveMinute = minuteDb - minuteDateNow;
      hourTimestamp = dateScheduler.getHours();
    }

    return (
      hourDateNow === hourTimestamp &&
      checkFiveMinute >= 0 &&
      checkFiveMinute <= 5
    );
  }

  isDiffDay(newDateTimestamp, multiples) {
    newDateTimestamp.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(
      (this.checkTimeMeeting() as any).dateTimeNow - newDateTimestamp,
    );
    const millisecondsOfDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.ceil(diffTime / millisecondsOfDay);
    return diffDays % multiples === 0;
  }

  isTimeDay(newDateTimestamp, channelId?) {
    newDateTimestamp.setHours(0, 0, 0, 0);
    return (this.checkTimeMeeting() as any).dateTimeNow - newDateTimestamp >= 0;
  }

  formatDate(time) {
    const today = new Date(time);
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const hours = today.getHours().toString().padStart(2, '0');
    const minutes = today.getMinutes().toString().padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hours}:${minutes}`;
  }

  async checkHolidayMeeting(date) {
    const format = this.formatDate(date);
    if (date.getDay() === 6 || date.getDay() === 0) {
      return true;
    }
    const holiday = await this.holidayRepository.find({
      where: {
        dateTime: format,
      },
    });
    return holiday.length > 0;
  }

  formatDateTimeReminder(date) {
    const d = [
      this.padTo2Digits(date.getDate()),
      this.padTo2Digits(date.getMonth() + 1),
      date.getFullYear(),
    ].join('/');

    const t = [
      this.padTo2Digits(date.getHours()),
      this.padTo2Digits(date.getMinutes()),
    ].join(':');

    return `${d} ${t}`;
  }

  getUserNameByEmail(string) {
    if (string.includes('@ncc.asia')) {
      return string.slice(0, string.length - 9);
    }
  }

  checkTime(time) {
    if (!time) return false;

    const curDate = new Date();
    const timezoneOffset = curDate.getTimezoneOffset() / -60;

    const firstTimeStart = this.setTime(
      curDate,
      6 + timezoneOffset,
      0,
    ).getTime();
    const firstTimeEnd = this.setTime(
      curDate,
      6 + timezoneOffset,
      30,
    ).getTime();
    const lastTimeStart = this.setTime(
      curDate,
      10 + timezoneOffset,
      25,
    ).getTime();

    const timeInMs = time.getTime();
    return (
      (timeInMs >= firstTimeStart && timeInMs < firstTimeEnd) ||
      timeInMs >= lastTimeStart
    );
  }

  withoutTime(dateTime) {
    const date = new Date(dateTime);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  validateTimeDDMMYYYY(time) {
    return /^([0-2][0-9]|(3)[0-1])(\/)(((0)[0-9])|((1)[0-2]))(\/)\d{4}$/.test(
      time,
    );
  }

  formatDayMonth(time) {
    const day = time.split('').slice(0, 2).join('');
    const month = time.split('').slice(3, 5).join('');
    const year = time.split('').slice(6, 10).join('');
    return `${month}/${day}/${year}`;
  }

  getTimeWeek(time) {
    let curr;
    if (time) {
      if (!this.validateTimeDDMMYYYY(time)) {
        return;
      }
      const timeFormat = this.formatDayMonth(time);
      curr = new Date(timeFormat);
    } else {
      curr = new Date();
    }
    // current date of week
    const currentWeekDay = curr.getDay();
    const lessDays = currentWeekDay == 0 ? 6 : currentWeekDay - 1;
    const firstweek = new Date(
      new Date(curr).setDate(curr.getDate() - lessDays),
    );
    const lastweek = new Date(
      new Date(firstweek).setDate(firstweek.getDate() + 7),
    );

    return {
      firstday: {
        timestamp: new Date(this.withoutTime(firstweek)).getTime(),
        date: this.formatDate(new Date(this.withoutTime(firstweek))),
      },
      lastday: {
        timestamp: new Date(this.withoutTime(lastweek)).getTime(),
        date: this.formatDate(new Date(this.withoutTime(lastweek))),
      },
    };
  }

  withoutTimeWFH(dateTime) {
    const date = new Date(dateTime);
    const curDate = new Date();
    const timezone = curDate.getTimezoneOffset() / -60;
    date.setHours(0 + timezone, 0, 0, 0);
    return date;
  }

  getTimeToDay(date) {
    let today;
    let tomorrows;
    if (date) {
      today = new Date(date);
      tomorrows = new Date(date);
    } else {
      today = new Date();
      tomorrows = new Date();
    }
    const tomorrowsDate = tomorrows.setDate(tomorrows.getDate() + 1);

    return {
      firstDay: new Date(this.withoutTimeWFH(today)),
      lastDay: new Date(this.withoutTimeWFH(tomorrowsDate)),
    };
  }

  getDateDay(time) {
    const date = time ? new Date(time) : new Date();
    const timezoneOffset = date.getTimezoneOffset() / -60;

    const createTimeRange = (startHour, startMinute, endHour, endMinute) => ({
      firstTime: this.setTime(
        date,
        startHour + timezoneOffset,
        startMinute,
      ).getTime(),
      lastTime: this.setTime(
        date,
        endHour + timezoneOffset,
        endMinute,
      ).getTime(),
    });

    return {
      morning: createTimeRange(0, 0, 2, 31),
      afternoon: createTimeRange(5, 0, 10, 1),
      fullday: createTimeRange(0, 0, 10, 0),
    };
  }

  withoutLastTime(dateTime) {
    const date = new Date(dateTime);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  getyesterdaydate() {
    const today = new Date();
    const yesterday = new Date(this.withoutLastTime(today));
    yesterday.setDate(yesterday.getDate() - 1);
    return (
      yesterday.getFullYear() +
      '-' +
      (yesterday.getMonth() + 1) +
      '-' +
      yesterday.getDate()
    );
  }
  withoutTimeMention(dateTime) {
    const date = new Date(dateTime);
    const curDate = new Date();
    const timezone = curDate.getTimezoneOffset() / -60;
    date.setHours(0 + timezone, 0, 0, 0);
    return date;
  }

  getTimeToDayMention(fomatDate) {
    let today;
    let tomorrows;
    if (fomatDate) {
      today = new Date(fomatDate);
      tomorrows = new Date(fomatDate);
    } else {
      today = new Date();
      tomorrows = new Date();
    }
    const tomorrowsDate = tomorrows.setDate(tomorrows.getDate() + 1);

    return {
      firstDay: new Date(this.withoutTimeMention(today)),
      lastDay: new Date(this.withoutTimeMention(tomorrowsDate)),
    };
  }

  getTimeWeekMondayToSunday(dayNow) {
    const curr = new Date();
    const currentWeekDay = curr.getDay();
    const lessDays = currentWeekDay == 0 ? 6 : currentWeekDay - 1;
    const firstweek = new Date(
      new Date(curr).setDate(curr.getDate() - lessDays),
    );
    const arrayDay = Array.from(
      { length: 9 - dayNow - 1 },
      (v, i) => i + dayNow + 1,
    );

    function getDayofWeek(rank) {
      return new Date(
        new Date(firstweek).setDate(firstweek.getDate() + rank - 2),
      );
    }
    return arrayDay.map((item) => getDayofWeek(item));
  }

  async getUserOffWork(date?) {
    try {
      const baseUrl =
        'https://timesheetapi.nccsoft.vn/api/services/app/Public/GetAllUserLeaveDay';
      const url = date ? `${baseUrl}?date=${date.toDateString()}` : baseUrl;

      const response = await this.axiosClientService.get(url);
      const result = response?.data?.result || [];

      const filterUsers = (type) =>
        result
          .filter((user) => user.message.includes(type))
          .map((item) => item.emailAddress.replace('@ncc.asia', ''));

      const userOffFullday = filterUsers('Off Fullday');
      const userOffMorning = filterUsers('Off Morning');
      const userOffAfternoon = filterUsers('Off Afternoon');

      const notSendUser =
        this.getStatusDay() === 'Morning'
          ? [...userOffFullday, ...userOffMorning]
          : [...userOffFullday, ...userOffAfternoon];

      return { notSendUser, userOffFullday, userOffMorning, userOffAfternoon };
    } catch (error) {
      console.log(error);
    }
  }

  getStatusDay() {
    const date = new Date();
    const hour = date.getHours() + date.getTimezoneOffset() / -60;

    if (hour < 5) {
      return 'Morning';
    } else if (hour < 11) {
      return 'Afternoon';
    }
    return 'Evening';
  }
}
