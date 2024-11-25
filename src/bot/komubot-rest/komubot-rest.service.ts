import { Injectable } from '@nestjs/common';
import { GetUserIdByUsernameDTO } from '../dto/getUserIdByUsername';
import { ClientConfigService } from '../config/client-config.service';
import { Brackets, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon, Daily, Uploadfile, User } from '../models';
import { SendMessageToUserDTO } from '../dto/sendMessageToUser';
import { EMessageMode, EUserType, FileType } from '../constants/configs';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { MessageQueue } from '../services/messageQueue.service';
import { join } from 'path';
import { SendMessageToChannelDTO } from '../dto/sendMessageToChannel';
import * as fs from 'fs';
import { UtilsService } from '../services/utils.services';
import { ReportDailyDTO } from '../dto/reportDaily';
import { GetUserIdByEmailDTO } from '../dto/getUserIdByEmail';

@Injectable()
export class KomubotrestService {
  private folderPath = '/home/nccsoft/projects/uploads/';
  private watcher: fs.FSWatcher;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
    @InjectRepository(Uploadfile)
    private uploadFileData: Repository<Uploadfile>,
    @InjectRepository(Daily)
    private dailyRepository: Repository<Daily>,
    private utilsService: UtilsService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
  ) {}

  async findUserData(_pramams) {
    return await this.userRepository
      .createQueryBuilder()
      .where(
        new Brackets((qb) => {
          qb.where(`"email" = :email and user_type = 'MEZON'`, {
            email: _pramams,
          }).andWhere(`"deactive" IS NOT true`);
        }),
      )
      .orWhere(
        new Brackets((qb) => {
          qb.where(`"username" = :username and user_type = 'MEZON'`, {
            username: _pramams,
          }).andWhere(`"deactive" IS NOT true`);
        }),
      )
      .andWhere('user_type = :userType', { userType: EUserType.MEZON })
      .getOne();
  }

  async getUserNotDaily() {
    return await this.dailyRepository
      .createQueryBuilder('daily')
      .where(
        `"createdAt" BETWEEN ${
          this.utilsService.getYesterdayDate() - 86400000
        } AND ${this.utilsService.getYesterdayDate()}`,
      )
      .select('daily.email')
      .execute();
  }

  async getReportUserDaily(query: ReportDailyDTO) {
    try {
      if (query.from && query.to) {
        const dailyFullday = await this.dailyRepository
          .createQueryBuilder('daily')
          .innerJoin('komu_channel', 'c', 'daily.channelid = c.id')
          .where(`"createdAt" >= :gtecreatedAt`, {
            gtecreatedAt: query.from,
          })
          .andWhere(`"createdAt" <= :ltecreatedAt`, {
            ltecreatedAt: query.to,
          })
          .select(
            'daily.id, daily.userid, daily.email, daily.daily, daily.createdAt, daily.channelId, c.name',
          )
          .execute();

        const promises = dailyFullday.map(async (item) => {
          return item;
        });
        const result = await Promise.all(promises);
        return { result };
      }
    } catch (error) {}
  }

  async getInfoUserByEmail(getUserIdByEmailDTO: GetUserIdByEmailDTO) {
    return await this.userRepository.find({
      where: {
        email: getUserIdByEmailDTO.email,
        user_type: EUserType.MEZON,
      },
    });
  }

  async getUserIdByUsername(
    getUserIdByUsernameDTO: GetUserIdByUsernameDTO,
    header,
    res,
  ) {
    if (!header || header !== this.clientConfig.machleoChannelId) {
      res.status(403).send({ message: 'Missing secret key!' });
      return;
    }

    if (!getUserIdByUsernameDTO.username) {
      res.status(400).send({ message: 'username can not be empty!' });
      return;
    }

    const userdb = await this.findUserData(getUserIdByUsernameDTO.username);
    if (!userdb) {
      res.status(400).send({ message: 'User not found!' });
      return;
    }

    res.status(200).send({
      username: getUserIdByUsernameDTO.username,
      userid: userdb.userId,
    });
  }

  sendMessageToUser = async (
    sendMessageToUserDTO: SendMessageToUserDTO,
    header,
    res,
  ) => {
    if (!header || header !== this.clientConfig.komubotRestSecretKey) {
      res.status(403).send({ message: 'Missing secret key!' });
      return;
    }

    if (!sendMessageToUserDTO.username) {
      res.status(400).send({ message: 'username can not be empty!' });
      return;
    }

    if (!sendMessageToUserDTO.message) {
      res.status(400).send({ message: 'Message can not be empty!' });
      return;
    }
    const username = sendMessageToUserDTO.username;
    const message = sendMessageToUserDTO.message;

    try {
      const findUser = await this.userRepository.findOne({
        where: { username: username, user_type: EUserType.MEZON },
      });
      if (!findUser) return;
      const messageToUser: ReplyMezonMessage = {
        userId: findUser.userId,
        textContent: message,
      };
      this.messageQueue.addMessage(messageToUser);
      res.status(200).send({ message: 'Successfully!' });
    } catch (error) {
      console.log('error', error);
      res.status(400).send({ message: error });
    }
  };

  sendMessageToChannel = async (
    sendMessageToChannelDTO: SendMessageToChannelDTO,
    header,
    res
  ) => {
    console.log('sendMessageToChannelDTO', sendMessageToChannelDTO, sendMessageToChannelDTO.message, header)
    if (!header || header !== this.clientConfig.komubotRestSecretKey) {
      console.log('Missing secret key')
      res.status(403).send({ message: 'Missing secret key!' });
      return;
    }

    if (!sendMessageToChannelDTO.channelid) {
      console.log('ChannelId can')
      res.status(400).send({ message: 'ChannelId can not be empty!' });
      return;
    }

    // if (sendMessageToChannelDTO.file) {
    //   console.log('No supported file')
    //   res.status(400).send({ message: 'No supported file!' });
    // }

    // if (sendMessageToChannelDTO.fileUrl) {
    //   res.status(400).send({ message: 'No supported file!' });
    // }

    if (!sendMessageToChannelDTO.message) {
      res.status(400).send({ message: 'Message can not be empty!' });
      return;
    }
    let message = sendMessageToChannelDTO.message;
    const channelId = sendMessageToChannelDTO.channelid;

    // get mentions in text
    const mentions = await Promise.all(
      [...message.matchAll(/@\S+/g)].map(async (match) => {
        const username = match[0].slice(1);
        const findUser = await this.userRepository.findOne({
          where: { username, user_type: EUserType.MEZON },
        });
        if (!findUser) return null;
        return {
          user_id: findUser.userId,
          s: match.index,
          e: match.index + match[0].length,
        };
      }),
    );

    const regexHttp = /http[s]?:\/\/[^\s]+/g;
    const matches = Array.from(message.matchAll(regexHttp));

    const lk = matches.map((match) => ({
      // text: match[0],
      s: match.index || 0,
      e: (match.index || 0) + match[0].length,
    })) || [];

    try {
      const findChannel = await this.channelRepository.findOne({
        where: { channel_id: channelId },
      });
      console.log('findChannel', findChannel)
      if (!findChannel) {
        res.status(400).send({ message: 'Cannot find this channel!s' });
        return;
      }
      const isThread =
        findChannel?.parrent_id !== '0' && findChannel?.parrent_id !== '';
      const replyMessage = {
        clan_id: this.clientConfig.clandNccId,
        channel_id: channelId,
        is_public: findChannel ? !findChannel?.channel_private : false,
        is_parent_public: findChannel ? findChannel?.is_parent_public : true,
        parent_id: '0',
        mode: isThread
          ? EMessageMode.THREAD_MESSAGE
          : EMessageMode.CHANNEL_MESSAGE,
        msg: {
          t: message,
          lk,
        },
        mentions: mentions.filter((user) => user) || [],
      };
      this.messageQueue.addMessage(replyMessage);
      res.status(200).send({ message: 'Successfully!' });
    } catch (error) {
      console.log('error send message channel', error);
      res.status(400).send({ message: error });
    }
  };

  async processMessage(message: string): Promise<string> {
    const regex = /{([^{}]+)}/g;
    const matches = message.match(regex);
    if (!matches) {
      return message;
    }

    for (const match of matches) {
      const email = match.substring(1, match.length - 1);
      const userId = await this.replaceMessageToChannel(email);
      if (userId !== null) {
        message = message.replace(match, `<@${userId}>`);
      }
    }
    return message;
  }
  async replaceMessageToChannel(email: string): Promise<string> {
    const user = await this.userRepository.findOne({
      select: ['userId'],
      where: {
        email: email,
        user_type: EUserType.MEZON,
        deactive: false,
      },
    });
    if (!user) {
      return null;
    }
    return user.userId;
  }

  async downloadFile() {
    return await this.uploadFileData.find({
      order: {
        createTimestamp: 'DESC',
      },
      take: 1,
    });
  }

  async getNcc8Episode(episode: string, file_type: string) {
    const file = await this.uploadFileData
      .createQueryBuilder()
      .where('"episode" = :episode', { episode })
      .andWhere('"file_type" = :file_type', { file_type })
      .orderBy('"createTimestamp"', 'DESC')
      .limit(1)
      .select('*')
      .execute();

    return file;
  }

  async findMaxEpisodeFilm(fileType: FileType): Promise<number> {
    const result = await this.uploadFileData
      .createQueryBuilder('upload_file')
      .select('MAX(upload_file.episode)', 'maxEpisode')
      .where('upload_file.file_type = :fileType', { fileType })
      .getRawOne();
    return result?.maxEpisode || 0;
  }

  startWatchingFolder() {
    this.watcher = fs.watch(this.folderPath, (eventType, filename) => {
      if (filename) {
        if (eventType === 'rename') {
          console.log(`Event type: ${eventType}`);
          const filePath = join(this.folderPath, filename);
          fs.stat(filePath, async (err, stats) => {
            if (err) {
              console.log(`${filename} was deleted.`);
              await this.uploadFileData.delete({
                fileName: `${filename}`,
              });
            } else if (stats.isFile()) {
              const isNewFilm = filename.startsWith('film_');
              if (isNewFilm) {
                console.log('New film inserted: ', filename);
                const episode = await this.findMaxEpisodeFilm(FileType.FILM); // find current episode film
                await this.uploadFileData.insert({
                  filePath: this.folderPath,
                  fileName: `${filename}`,
                  createTimestamp: Date.now(),
                  episode: episode + 1,
                  file_type: FileType.FILM,
                });
              }
              const isNewAudioBook = filename.startsWith('audiobook_');
              if (isNewAudioBook) {
                // find current episode audioBook
                const episodeBook = await this.findMaxEpisodeFilm(
                  FileType.AUDIOBOOK,
                );
                await this.uploadFileData.insert({
                  filePath: this.folderPath,
                  fileName: `${filename}`,
                  createTimestamp: Date.now(),
                  episode: episodeBook + 1,
                  file_type: FileType.AUDIOBOOK,
                });
              }
            }
          });
        }
      }
    });
    console.log(`Started watching folder: ${this.folderPath}`);
  }
}
