import { Injectable } from '@nestjs/common';
import Parser from 'rss-parser';
import { News } from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EMessageMode } from '../constants/configs';
import { ClientConfigService } from '../config/client-config.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { MessageQueue } from '../services/messageQueue.service';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class NewsScheduler {
  private parser: Parser;
  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
  ) {
    this.parser = new Parser();
  }

  async getMaxPubDate() {
    const findNews = await this.newsRepository
      .createQueryBuilder('news')
      .select('MAX(news.pubDate)', 'maxPubDate')
      .getRawOne();
    return { maxPubDate: findNews?.maxPubDate || 0, link: findNews.link || '' };
  }

  private async filterToday(items) {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const { maxPubDate, link } = await this.getMaxPubDate();
    return items.filter((item) => {
      const date = new Date(item.pubDate);
      return (
        date.getFullYear() === todayYear &&
        date.getMonth() === todayMonth &&
        date.getDate() === todayDate &&
        date.getTime() >= maxPubDate &&
        item.link !== link
      );
    });
  }

  async fetchRssFeed(url: string) {
    try {
      const feed = await this.parser.parseURL(url);
      const todayItems = await this.filterToday(feed.items);
      if (!todayItems.length) return;
      const insertedItems = await Promise.all(
        todayItems.map(async (item) => {
          const dataNews = {
            title: item.title,
            link: item.link,
            pubDate: new Date(item.pubDate).getTime(),
            contentSnippet: item.contentSnippet,
            enclosure: item.enclosure,
            urlImage: item?.enclosure?.url ?? '',
          };
          const findNews = await this.newsRepository.findOne({
            where: { link: item.link },
          });
          if (!findNews) {
            await this.newsRepository.insert(dataNews);
          }
          return dataNews;
        }),
      );

      return insertedItems;
    } catch (error) {
      console.log('fetchRssFeed', error);
    }
  }

  @Cron('0 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleNews() {
    const dataNews = await this.fetchRssFeed(
      'https://vnexpress.net/rss/tin-moi-nhat.rss',
    );
    if (!dataNews?.length) return;
    dataNews.forEach(async (news) => {
      const { data } = await axios.get(news.link);

      const $ = cheerio.load(data);
      const string = [];
      let totalLength = 0;
      let checkLimit = false;
      $(`.Normal`).each((_, element) => {
        const t = $(element).text().trim();
        if (totalLength + t.length > 1999) {
          checkLimit = true;
          return false;
        }
        string.push(t);
        totalLength += t.length + 1;
      });
      const texts = string.join('\n');

      const line = `📰📰📰 `;
      const text =
        line +
        news.title.toUpperCase() +
        '\n' +
        `- ${news.contentSnippet}` +
        texts +
        (checkLimit ? '...' : '') +
        '\n' +
        `👉👉👉 ` +
        news.link;
      const messageReply = {
        t: text,
        lk: [
          {
            s:
              line.length +
              news.title.length +
              news.contentSnippet.length +
              texts.length +
              11 +
              (checkLimit ? 3 : 0),
            e: text.length,
          },
        ],
      };

      const attachments = news?.enclosure?.url
        ? [
            {
              url: news?.enclosure?.url,
              filetype: news.enclosure.type,
            },
          ]
        : [];
      const replyMessage: ReplyMezonMessage = {
        clan_id: this.clientConfig.clandNccId,
        channel_id: this.clientConfig.newsChannelId,
        is_public: true,
        mode: EMessageMode.CHANNEL_MESSAGE,
        msg: messageReply,
        attachments,
      };
      this.messageQueue.addMessage(replyMessage);
    });
  }
}
