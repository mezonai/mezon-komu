import { ChannelMessage, InteractiveBuilder } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import axios from 'axios';
import { addDays, differenceInCalendarDays, format } from 'date-fns';

@Command('weather')
export class WeatherCommand extends CommandMessage {
  constructor() {
    super();
  }

  async getWeatherData(location) {
    const { data } = await axios.get(
      `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_KEY}&q=${location}&aqi=yes`,
    );
    return data ? data : null;
  }

  async getWeatherForecastData(location, day) {
    const { data } = await axios.get(
      `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_KEY}&q=${location}&days=${day + 1}&aqi=yes&alerts=no`,
    );
    return data ? data : null;
  }

  getDateFormatted(day = 0) {
    const tomorrow = addDays(new Date(), day);
    return format(tomorrow, 'dd/MM/yyyy');
  }

  getDaysDifference(targetDate: string, hour?: string) {
    let time = targetDate;
    if (time === 'today') {
      time = this.getDateFormatted();
    }
    if (time === 'tomorrow' || time === 'tmr') {
      time = this.getDateFormatted(1);
    }
    if (time === 'thenextday' || time === 'tnd') {
      time = this.getDateFormatted(2);
    }

    const day = time.slice(0, 2);
    const month = time.slice(3, 5);
    const year = time.slice(6);
    const format = `${month}/${day}/${year} ${hour ? hour : ''}`;
    const formatLocation = `${year}-${month}-${day} ${hour ? hour : ''}`;
    const target = new Date(format);
    const today = new Date();
    return {
      day: differenceInCalendarDays(target, today),
      timestamp: target.getTime() / 1000,
      format: formatLocation,
    };
  }

  formatWeatherData(
    data,
    formatNumber,
    locationName,
    noTitle,
    forecast?,
    dataForecast?,
  ) {
    const dataRender = forecast ? data : data?.current;
    const interactiveBuilder = new InteractiveBuilder(
      `${forecast ? 'Forecast' : 'Current'} weather ${data?.location?.name ?? locationName} - ${data?.location?.country ?? dataForecast?.location?.country} at ${data?.location?.localtime ?? data?.time}`,
    );
    interactiveBuilder.setDescription(
      '```' +
        `Condition     : ${dataRender?.condition?.text}\n` +
        `Temperature: ${dataRender?.temp_c}℃ / ${dataRender?.temp_f}℉\n` +
        `Humidity      : ${dataRender?.humidity} %\n` +
        `Cloud cover : ${dataRender?.cloud} %\n` +
        `Rainfall        : ${dataRender?.precip_mm} mm\n` +
        `UV               : ${dataRender?.uv}\n` +
        `PM2.5          : ${dataRender?.air_quality?.pm2_5 ?? '(no information)'} ${dataRender?.air_quality?.pm2_5 ? 'µg/m³' : ''}` +
        '```',
    );
    interactiveBuilder.setThumbnail(dataRender?.condition?.icon);
    return interactiveBuilder.build();
  }

  formatWeatherForecastData(forecastData, formatNumber, locationName, country) {
    const interactiveBuilder = new InteractiveBuilder(
      `Forecast weather ${locationName} - ${country} at ${forecastData.format}all day`,
    );
    interactiveBuilder.setDescription(
      '```' + `Condition                  :  ${forecastData?.condition?.text}\n` +
        `Max temperature      :  ${forecastData?.maxtemp_c}℃ / ${forecastData?.maxtemp_f}℉\n` +
        `Min temperature       :  ${forecastData?.mintemp_c}℃ / ${forecastData?.mintemp_f}℉\n` +
        `Average Humidity     :  ${forecastData?.avghumidity} %\n` +
        `Chance of rain          :  ${forecastData?.daily_chance_of_rain} %\n` +
        `Average temperature:  ${forecastData?.avgtemp_c}℃ / ${forecastData?.avgtemp_f}℉\n` +
        `UV                             :  ${forecastData?.uv}\n` +
        `PM2.5                       :  ${forecastData?.air_quality?.pm2_5 ?? '(no information)'} ${forecastData?.air_quality?.pm2_5 ? 'µg/m³' : ''}\n` +
        `PM10                        :  ${forecastData?.air_quality?.pm_10 ?? '(no information)'} ${forecastData?.air_quality?.pm_10 ? 'µg/m³' : ''}` + '```',
    );
    interactiveBuilder.setThumbnail(forecastData?.condition?.icon);
    return interactiveBuilder.build();
  }

  async execute(args: string[], message: ChannelMessage) {
    const hasHour = args[2]?.includes(':');
    let location = args.join(' ');
    const formatNumber = ' '.repeat(15);
    try {
      if (!args[0]) {
        const messageContent =
          '- Command: *weather location -> Thời tiết hiện tại tại địa điểm' +
          '\n' +
          `  Example: *weather vinh\n` +
          '- Command: *weather fcst dd/mm/yyyy location -> Dự báo thời tiết cho cả ngày (Có thể dùng "today", "tmr", "tnd" thay cho ngày giờ)' +
          '\n' +
          `  Example: --*weather fcst 11/11/2025 vinh-- HOẶC --*weather fcst tmr vinh--\n` +
          '- Command: *weather fcst dd/mm/yyyy hh:mm location -> Dự báo chính xác tại 1 giờ trong ngày' +
          '\n' +
          `  Example: --*weather fcst 11/11/2024 09:00 vinh-- HOẶC --*weather fcst tmr 09:00 vinh--`;
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 'pre', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      if (args[0] === 'fcst') {
        location = args.slice(hasHour ? 3 : 2).join(' ');
        const checkArg =
          ['today', 'tomorrow', 'thenextday', 'tmr', 'tnd'].includes(args[1]) ||
          args[1].length === 10;
        if (!checkArg) {
          const messageContent = 'Invalid date!';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 'pre', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        const { day, timestamp, format } = this.getDaysDifference(
          args[1],
          hasHour ? args[2] : null,
        );
        console.log('day', day, location)
        const dataApi = await this.getWeatherForecastData(location, day);
        console.log('dataApi', dataApi)
        const forecastData = dataApi?.forecast?.forecastday[day];
        let messageContent;
        if (day < 0 || day > 3) {
          let messageContent = '';
          if (day < 0) {
            messageContent = 'Can not forecast past time!';
          }
          if (day > 3) {
            messageContent = 'Cannot forecast more than 3 days';
          }
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 'pre', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        let embed;
        if (!hasHour) {
          embed = this.formatWeatherForecastData(
            { ...forecastData.day, format },
            formatNumber,
            dataApi?.location?.name,
            dataApi?.location?.country,
          );
        }

        if (hasHour) {
          const hourTimeStamp = new Date(format);
          if (hourTimeStamp.getTime() - Date.now() <= 0) {
            const messageContent = 'Can not forecast past time!';
            return this.replyMessageGenerate(
              {
                messageContent,
                mk: [{ type: 'pre', s: 0, e: messageContent.length }],
              },
              message,
            );
          }
          const dataHour = forecastData.hour.filter(
            (item) => item.time_epoch >= timestamp,
          )[0];
          embed = this.formatWeatherData(
            dataHour,
            formatNumber,
            dataApi?.location?.name,
            false,
            true,
            dataApi,
          );
        }
        return this.replyMessageGenerate(
          {
            embed: [embed],
          },
          message,
        );
      }
      const mainWeatherData = await this.getWeatherData(location);
      if (args[0] === 'ncc') {
        const nccCorners = ['Ha Noi', 'Vinh', 'Da Nang', 'Quy Nhon', 'Sai Gon'];
        let cornerWeatherData;
        const weatherPromises = nccCorners.map(async (corner) => {
          cornerWeatherData = await this.getWeatherData(corner);
          return this.formatWeatherData(
            cornerWeatherData,
            formatNumber,
            corner,
            true,
          );
        });

        const results = await Promise.all(weatherPromises);
        return this.replyMessageGenerate(
          {
            embed: results,
          },
          message,
        );
      }
      const embed = this.formatWeatherData(
        mainWeatherData,
        formatNumber,
        mainWeatherData?.location?.name,
        false,
      );

      return this.replyMessageGenerate(
        {
          embed: [embed],
        },
        message,
      );
    } catch (error) {
      const messageContent = '' + `Can't get data from ${location}` + '';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }
  }
}
