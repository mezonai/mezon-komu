import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import moment from 'moment-timezone';

type Ncc8ScheduleConfig = {
  optionalWeekdays: number[];
};

@Injectable()
export class Ncc8ScheduleConfigService {
  private readonly defaultWeekday = 5;
  private optionalWeekdays: number[] = [];
  private readonly configFile = join(
    process.cwd(),
    'data',
    'ncc8ScheduleConfig.json',
  );

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    if (!existsSync(this.configFile)) {
      this.optionalWeekdays = [];
      return;
    }

    const data = JSON.parse(
      readFileSync(this.configFile, 'utf8'),
    ) as Ncc8ScheduleConfig;
    this.optionalWeekdays = this.normalizeWeekdays(data.optionalWeekdays ?? []);
  }

  private saveConfig() {
    const dir = dirname(this.configFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(
      this.configFile,
      JSON.stringify({ optionalWeekdays: this.optionalWeekdays }, null, 2),
      'utf8',
    );
  }

  private normalizeWeekdays(weekdays: number[]) {
    return Array.from(
      new Set(
        weekdays.filter(
          (weekday) =>
            Number.isInteger(weekday) &&
            weekday >= 0 &&
            weekday <= 6 &&
            weekday !== this.defaultWeekday,
        ),
      ),
    ).sort((a, b) => a - b);
  }

  getEnabledWeekdays() {
    return Array.from(
      new Set([this.defaultWeekday, ...this.optionalWeekdays]),
    ).sort((a, b) => a - b);
  }

  getOptionalWeekdays() {
    return [...this.optionalWeekdays];
  }

  isEnabledWeekday(weekday: number) {
    return this.getEnabledWeekdays().includes(weekday);
  }

  enableWeekday(weekday: number) {
    if (weekday === this.defaultWeekday) return this.getEnabledWeekdays();
    this.optionalWeekdays = this.normalizeWeekdays([
      ...this.optionalWeekdays,
      weekday,
    ]);
    this.saveConfig();
    return this.getEnabledWeekdays();
  }

  disableWeekday(weekday: number) {
    if (weekday === this.defaultWeekday) return this.getEnabledWeekdays();
    this.optionalWeekdays = this.optionalWeekdays.filter(
      (day) => day !== weekday,
    );
    this.saveConfig();
    return this.getEnabledWeekdays();
  }

  parseWeekday(input?: string) {
    if (!input) return null;
    const normalized = input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const weekdayMap: Record<string, number> = {
      cn: 0,
      sunday: 0,
      sun: 0,
      thu2: 1,
      t2: 1,
      '2': 1,
      monday: 1,
      mon: 1,
      thu3: 2,
      t3: 2,
      '3': 2,
      tuesday: 2,
      tue: 2,
      thu4: 3,
      t4: 3,
      '4': 3,
      wednesday: 3,
      wed: 3,
      thu5: 4,
      t5: 4,
      '5': 4,
      thursday: 4,
      thu: 4,
      thu6: 5,
      t6: 5,
      '6': 5,
      friday: 5,
      fri: 5,
      thu7: 6,
      t7: 6,
      '7': 6,
      saturday: 6,
      sat: 6,
    };

    return weekdayMap[normalized] ?? null;
  }

  formatWeekday(weekday: number) {
    const labelMap: Record<number, string> = {
      0: 'chu nhat',
      1: 'thu 2',
      2: 'thu 3',
      3: 'thu 4',
      4: 'thu 5',
      5: 'thu 6',
      6: 'thu 7',
    };
    return labelMap[weekday] ?? `weekday ${weekday}`;
  }

  getLatestEnabledDate() {
    const today = moment.tz('Asia/Ho_Chi_Minh').startOf('day');
    const enabledWeekdays = this.getEnabledWeekdays();
    let latest = today.clone();

    for (let i = 0; i < 7; i += 1) {
      const candidate = today.clone().subtract(i, 'day');
      if (enabledWeekdays.includes(candidate.day())) {
        latest = candidate;
        break;
      }
    }

    return latest;
  }
}
