import moment from 'moment';
import { ExcelProcessor } from './excel-processor';

export function getPreviousWorkingDay(
  date: moment.Moment = moment(),
): moment.Moment {
  let previousDay = date.subtract(1, 'day'); // Start with the day before the given date

  while (previousDay.isoWeekday() > 5) {
    previousDay = previousDay.subtract(1, 'day');
  }

  return previousDay;
}

export function handleDailyFine(daily, excelProcessor: ExcelProcessor) {
  for (let item of daily) {
    excelProcessor.updateCellValue(
      item.email,
      'daily',
      Number(item.count) * 20,
    );
  }
}

export function handleMentionFine(mention, excelProcessor: ExcelProcessor) {
  for (let item of mention) {
    excelProcessor.updateCellValue(item.email, 'komu', Number(item.count) * 20);
  }
}

export function handleWFHFine(wfh, excelProcessor: ExcelProcessor) {
  for (let item of wfh) {
    excelProcessor.updateCellValue(
      item.username,
      'komu',
      Number(item.total) * 20,
    );
  }
}

export function handleTrackerFine(tracker, excelProcessor: ExcelProcessor) {
  //Fortna team
  const ignoredEmail = [
    'ha.nguyen',
    'hiep.ngoxuan',
    'diem.buithi',
    'linh.vutai',
    'hoang.nguyenanh',
    'phuong.dangdanh',
    'phuc.duong',
    'ha.nguyenthi',
    'hang.buithidiem',
    'thai.buiminh',
    'trang.tranthu',
  ];

  let secondsMorning = 3 * 3600;
  let secondsAfternoon = 4 * 3600;

  for (let item of tracker) {
    let requireTime = secondsMorning + secondsAfternoon;

    const {
      email,
      str_active_time,
      offWork,
    }: {
      email: string;
      str_active_time: string;
      offWork: string;
    } = item;

    if (ignoredEmail.includes(email.toLowerCase().trim())) {
      continue;
    }

    if (offWork) {
      if (offWork.toLowerCase().includes('morning')) {
        requireTime = requireTime - secondsMorning;
      } else if (offWork.toLowerCase().includes('afternoon')) {
        requireTime = requireTime - secondsAfternoon;
      }

      if (offWork.includes(':')) {
        let timeOffSeconds = 0;
        const timeOff = offWork
          .split(':')
          .slice(1)[0]
          ?.trim()
          ?.replace('h', '');

        if (!isNaN(parseFloat(timeOff))) {
          timeOffSeconds = Math.round(parseFloat(timeOff) * 3600);
        }

        requireTime = requireTime - timeOffSeconds;
      }
    }

    const regex = /(\d+)h(\d+)m(\d+)s/;
    const match = str_active_time.match(regex);
    const totalTime =
      parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);

    const missingTime = requireTime - totalTime;

    let fine = 0;

    if (missingTime >= 6 * 3600) {
      fine = 200;
    } else if (missingTime >= 4 * 3600) {
      fine = 100;
    } else if (missingTime >= 2 * 3600) {
      fine = 50;
    } else if (missingTime >= 1 * 3600) {
      fine = 20;
    }

    excelProcessor.updateCellValue(email, 'tracker', fine);
  }
}
