import { ChannelMessage } from 'mezon-sdk';
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
    if (time === 'tomorrow') {
      time = this.getDateFormatted(1);
    }
    if (time === 'thenextday') {
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
    let title = '-'.repeat(50) + '\n';
    if (!noTitle) {
      title = `${forecast ? 'Forecast' : 'Current'} weather in ${data?.location?.name ?? locationName} - ${data?.location?.country ?? dataForecast?.location?.country} at ${data?.location?.localtime ?? data?.time}\n`;
    }

    return (
      title +
      `${formatNumber}Condition  : ${dataRender?.condition?.text}\n` +
      `${formatNumber}Temperature: ${dataRender?.temp_c}℃ / ${dataRender?.temp_f}℉\n` +
      `${formatNumber}Humidity   : ${dataRender?.humidity} %\n` +
      `   ${locationName}${' '.repeat(12 - locationName?.length)}Cloud cover: ${dataRender?.cloud} %\n` +
      `${formatNumber}Rainfall   : ${dataRender?.precip_mm} mm\n` +
      `${formatNumber}UV         : ${dataRender?.uv}\n` +
      `${formatNumber}PM2.5      : ${dataRender?.air_quality?.pm2_5 ?? '(no information)'} ${dataRender?.air_quality?.pm2_5 ? 'µg/m³' : ''}\n`
    );
  }

  formatWeatherForecastData(forecastData, formatNumber, locationName, country) {
    const title = `Forecast weather in ${locationName} - ${country} at ${forecastData.format}all day\n`;

    return (
      title +
      `${formatNumber}Condition          : ${forecastData?.condition?.text}\n` +
      `${formatNumber}Max temperature    : ${forecastData?.maxtemp_c}℃ / ${forecastData?.maxtemp_f}℉\n` +
      `${formatNumber}Min temperature    : ${forecastData?.mintemp_c}℃ / ${forecastData?.mintemp_f}℉\n` +
      `${formatNumber}Average Humidity   : ${forecastData?.avghumidity} %\n` +
      `   ${locationName}${' '.repeat(12 - locationName?.length)}Chance of rain     : ${forecastData?.daily_chance_of_rain} %\n` +
      `${formatNumber}Average temperature: ${forecastData?.avgtemp_c}℃ / ${forecastData?.avgtemp_f}℉\n` +
      `${formatNumber}UV                 : ${forecastData?.uv}\n` +
      `${formatNumber}PM2.5              : ${forecastData?.air_quality?.pm2_5 ?? '(no information)'} ${forecastData?.air_quality?.pm2_5 ? 'µg/m³' : ''}\n` +
      `${formatNumber}PM10               : ${forecastData?.air_quality?.pm_10 ?? '(no information)'} ${forecastData?.air_quality?.pm_10 ? 'µg/m³' : ''}\n`
    );
  }

  async execute(args: string[], message: ChannelMessage) {
    const hasHour = args[2]?.includes(':');
    let location = args.join(' ');
    const formatNumber = ' '.repeat(15);
    try {
      if (args[0] === 'forecast') {
        location = args.slice(hasHour ? 3 : 2).join(' ');
        const checkArg =
          ['today', 'tomorrow', 'thenextday'].includes(args[1]) ||
          args[1].length === 10;
        if (!checkArg) {
          const messageContent = '```Invalid date!```';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        const { day, timestamp, format } = this.getDaysDifference(
          args[1],
          hasHour ? args[2] : null,
        );

        const dataApi = await this.getWeatherForecastData(location, day);
        const forecastData = dataApi?.forecast?.forecastday[day];
        let messageContent = '';
        if (day < 0 || day > 3) {
          let messageContent = '';
          if (day < 0) {
            messageContent = '```Can not forecast past time!```';
          }
          if (day > 3) {
            messageContent = '```Cannot forecast more than 3 days```';
          }
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        if (!hasHour) {
          messageContent = this.formatWeatherForecastData(
            { ...forecastData.day, format },
            formatNumber,
            dataApi?.location?.name,
            dataApi?.location?.country,
          );
        }

        if (hasHour) {
          const hourTimeStamp = new Date(format);
          if (hourTimeStamp.getTime() - Date.now() <= 0) {
            const messageContent = '```Can not forecast past time!```';
            return this.replyMessageGenerate(
              {
                messageContent,
                mk: [{ type: 't', s: 0, e: messageContent.length }],
              },
              message,
            );
          }
          const dataHour = forecastData.hour.filter(
            (item) => item.time_epoch >= timestamp,
          )[0];
          messageContent = this.formatWeatherData(
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
            messageContent: '```' + messageContent + '```',
            mk: [{ type: 't', s: 0, e: messageContent.length + 6 }],
            // attachments,
          },
          message,
        );
      }
      const mainWeatherData = await this.getWeatherData(location);
      let messageContent = '';

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
        messageContent =
          `Current weather of all our corners at ${cornerWeatherData?.location?.localtime}\n` +
          results.join('\n') +
          `(Last updated on ${cornerWeatherData?.current?.last_updated})`;
      } else {
        messageContent =
          this.formatWeatherData(
            mainWeatherData,
            formatNumber,
            mainWeatherData?.location?.name,
            false,
          ) + `(Last updated on ${mainWeatherData?.current?.last_updated})`;
      }

      const attachments = [];
      if (args[0] !== 'ncc') {
        attachments.push({
          url: mainWeatherData?.current?.condition?.icon,
          filetype: 'image/jpeg',
        });
      }

      return this.replyMessageGenerate(
        {
          messageContent: '```' + messageContent + '```',
          mk: [{ type: 't', s: 0, e: messageContent.length + 6 }],
          // attachments,
        },
        message,
      );
    } catch (error) {
      const messageContent = '```' + `Can't get data from ${location}` + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }
  }
}
