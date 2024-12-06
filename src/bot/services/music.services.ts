import { Injectable } from '@nestjs/common';
import { AxiosClientService } from './axiosClient.services';
import * as cheerio from 'cheerio';
import { EButtonMessageStyle, EMessageComponentType } from 'mezon-sdk';
import { EmbedProps, MEZON_EMBED_FOOTER } from '../constants/configs';
import { getRandomColor } from '../utils/helper';
import { replyMessageGenerate } from '../utils/generateReplyMessage';
@Injectable()
export class MusicService {
  private NCTSearchUrl =
    'https://www.nhaccuatui.com/tim-kiem/bai-hat?b=keyword&l=tat-ca&s=default&q=';
  constructor(private readonly axiosClientService: AxiosClientService) {}

  async getMp3Link(id: string) {
    const urlSong = `https://www.nhaccuatui.com/bai-hat/luot-tren-con-song-rap-viet-ft-dangrangto.${id}.html`;
    const response1 = await this.axiosClientService.get(urlSong);
    if (response1.status == 200) {
      const regex = /player.peConfig.xmlURL\s*=\s*"([^"]+)"/;
      const match = response1.data.match(regex);
      const response2 = await this.axiosClientService.get(match[1]);
      if (response2.status == 200) {
        const regex = /<locationHQ>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/locationHQ>/;
        let match = response2.data.match(regex);

        if (!match || !match[1]) {
          const regex2 = /<location>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/location>/;
          match = response2.data.match(regex2);
        }
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    return '';
  }

  async getMusicListMessage(message, songName, page) {
    const SONG_PER_SEND = 10;
    const result = await this.searchMusic(songName, page);
    if (result.songs.length > 0) {
      let fields = [];
      const mess = [];
      for (let i = 0; i < result.songs.length; i++) {
        const song = result.songs[i];

        fields.push({
          name: song.name,
          // value: song.id,
          button: [
            {
              id: `music_play_${song.id}`,
              component: {
                icon: 'PLAY',
                label: '',
              },
              type: EMessageComponentType.BUTTON,
            },
          ],
          style: EButtonMessageStyle.PRIMARY,
        });
        if ((i + 1) % SONG_PER_SEND == 0) {
          const embed: EmbedProps[] = [
            {
              color: getRandomColor(),
              title: `List song with keyword "${songName}" trang ${page}`,
              fields,
              timestamp: new Date().toISOString(),
              footer: MEZON_EMBED_FOOTER,
            },
          ];

          mess.push(
            replyMessageGenerate(
              {
                embed,
              },
              message,
            ),
          );

          fields = [];
        }
      }
      if (result.pageNumbers.length > 0) {
        const components = [
          {
            components: result.pageNumbers.map((value) => ({
              type: EMessageComponentType.BUTTON,
              id: `music_search_${songName}_${value}_${message.is_public ? 1 : 0}_${message.mode}`,
              component: {
                label: value,
                style: EButtonMessageStyle.PRIMARY,
              },
            })),
          },
        ];
        mess.push(
          replyMessageGenerate(
            {
              components,
            },
            message,
          ),
        );
      }

      return mess;
    }
  }
  async searchMusic(songName: string, page = 1) {
    const url = this.NCTSearchUrl + songName + '&page=' + page;
    const response = await this.axiosClientService.get(url);
    if (response.status == 200) {
      const $ = cheerio.load(response.data);
      const songs = [];

      $('.sn_search_returns_list_song .sn_search_single_song').each(
        (index, element) => {
          const linkElement = $(element).find('a');

          const name = linkElement.text().trim();

          const id = $(linkElement).attr('key');
          if (name && id) {
            songs.push({ name, id });
          }
        },
      );

      const pages = $('.box_pageview .number');
      const pageNumbers = [];
      pages.each((index, element) => {
        const pageNumber = $(element).text().trim();
        if (!isNaN(Number(pageNumber))) pageNumbers.push(pageNumber);
      });

      return { songs, pageNumbers };
    }

    return { songs: [], pages: [] };
  }
}
