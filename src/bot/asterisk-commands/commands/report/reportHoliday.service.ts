import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Holiday } from 'src/bot/models/holiday.entity';
import { Repository } from 'typeorm';
@Injectable()
export class ReportHolidayService {
  constructor(
    @InjectRepository(Holiday)
    private holidayRepository: Repository<Holiday>,
  ) {}

  async reportHoliday() {
    const today = Date.now();
    const getYear = new Date(today).getFullYear();
    const holiday = await this.holidayRepository.find();

    if (!holiday) {
      return;
    } else if (Array.isArray(holiday) && holiday.length === 0) {
      return 'Không có lịch nghỉ lễ nào';
    } else {
      for (let i = 0; i <= Math.ceil(holiday.length / 50); i += 1) {
        if (holiday.slice(i * 50, (i + 1) * 50).length === 0) break;
        const mess = holiday
          .slice(i * 50, (i + 1) * 50)
          .filter((item) => item.dateTime.slice(6) === getYear.toString())
          .map((check) => `${check.dateTime} ${check.content}`)
          .join('\n');
        return 'Các ngày nghỉ lễ trong năm:\n' + mess;
      }
    }
  }
}
