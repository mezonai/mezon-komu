import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { getRandomColor, getUserNameByEmail, sleep } from '../utils/helper';
import { Uploadfile, User } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EmbedProps,
  EMessageMode,
  EUserType,
  FFmpegImagePath,
  FileType,
} from '../constants/configs';
import { join } from 'path';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MezonClient } from 'mezon-sdk';
import { ClientConfigService } from '../config/client-config.service';
import { Cron } from '@nestjs/schedule';
import { AxiosClientService } from '../services/axiosClient.services';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { MessageQueue } from '../services/messageQueue.service';
import { TimeSheetService } from '../services/timesheet.services';
import { NCC8Service } from '../services/ncc8.services';

@Injectable()
export class Ncc8SchedulerService {
  private client: MezonClient;
  constructor(
    private ffmpegService: FFmpegService,
    @InjectRepository(Uploadfile)
    private uploadFileData: Repository<Uploadfile>,
    private clientService: MezonClientService,
    private clientConfigService: ClientConfigService,
    private axiosClientService: AxiosClientService,
    private messageQueue: MessageQueue,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private timeSheetService: TimeSheetService,
    private ncc8Service: NCC8Service,
  ) {
    this.client = this.clientService.getClient();
  }

  async findCurrentNcc8Episode(fileType: FileType) {
    return await this.uploadFileData
      .createQueryBuilder('upload_file')
      .where('upload_file.file_type = :fileType', { fileType })
      .orderBy('upload_file.episode', 'DESC')
      .getOne();
  }

  @Cron('29 11 * * 5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8JoinScheduler() {
    const wfhResult = await this.timeSheetService.findWFHUser();
    const wfhUserEmail = wfhResult
      .filter((item) => ['Morning', 'Fullday'].includes(item.dateTypeName))
      .map((item) => {
        return getUserNameByEmail(item.emailAddress);
      });

    const findUserWfh = await this.userRepository
      .createQueryBuilder('user')
      .where(
        '(user.clan_nick IN (:...wfhUserEmail) OR user.username IN (:...wfhUserEmail))',
      )
      .andWhere('user.user_type = :userType')
      .setParameters({
        wfhUserEmail,
        userType: EUserType.MEZON,
      })
      .getMany();
    const text = '[WARNING] Ncc8 will play in 1 minute, please go to ';
    const channelLabel = '#ncc8-radio';
    findUserWfh.map((user) => {
      const messageToUser: ReplyMezonMessage = {
        userId: user.userId,
        textContent: text + channelLabel,
        messOptions: {
          hg: [
            {
              channelid: process.env.MEZON_NCC8_CHANNEL_ID,
              s: text.length,
              e: text.length + channelLabel.length,
            },
          ],
        },
        code: user.buzzNcc8 ? 8 : undefined,
      };
      this.messageQueue.addMessage(messageToUser);
    });
  }

  @Cron('30 11 * * 1,5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8Scheduler() {
    console.log('ncc8Scheduler');
    if (this.ncc8Service.getSocket()) {
      this.ncc8Service.wsSend('', { Key: 'stop_publisher' });
    }
    await sleep(1000);
    this.ncc8Service.playNcc8(
      'https://cdn.mezon.ai/0/1840659984552038400/1827994776956309500/1746701451462_0ncc8.ogg',
    );
  }

  @Cron('5 12 * * 1,5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8SummaryScheduler() {
    const currentNcc8 = await this.findCurrentNcc8Episode(FileType.NCC8);
    const currentNcc8FileName = currentNcc8?.fileName;
    console.log('currentNcc8FileName', currentNcc8FileName);
    const { data } = await this.axiosClientService.post(
      process.env.NCC8_SUMARY_API,
      {
        file_name: currentNcc8FileName,
      },
    );
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `NCC8 SUMARY SỐ ${currentNcc8?.episode ?? 'GÌ GÌ ĐÓ'}`,
        description: '```' + `${data?.response}` + '```',
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Powered by Mezon',
          icon_url:
            'https://cdn.mezon.vn/1837043892743049216/1840654271217930240/1827994776956309500/857_0246x0w.webp',
        },
      },
    ];
    const replyMessage: ReplyMezonMessage = {
      clan_id: this.clientConfigService.clandNccId,
      channel_id: this.clientConfigService.mezonNhaCuaChungChannelId,
      is_public: false,
      mode: EMessageMode.CHANNEL_MESSAGE,
      msg: {
        t: '',
        embed,
      },
    };
    this.messageQueue.addMessage(replyMessage);
  }
}
