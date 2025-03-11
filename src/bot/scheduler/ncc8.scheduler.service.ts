import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { getRandomColor, sleep } from '../utils/helper';
import { Uploadfile } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EmbedProps, EMessageMode, FFmpegImagePath, FileType } from '../constants/configs';
import { join } from 'path';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MezonClient } from 'mezon-sdk';
import { ClientConfigService } from '../config/client-config.service';
import { Cron } from '@nestjs/schedule';
import { AxiosClientService } from '../services/axiosClient.services';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { MessageQueue } from '../services/messageQueue.service';

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

  // @Cron('29 11 * * 5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8Scheduler() {
    await sleep(42000);
    this.ffmpegService.killCurrentStream(FileType.NCC8);
    await sleep(2000);
    const currentNcc8 = await this.findCurrentNcc8Episode(FileType.NCC8);
    const nccPath = join(__dirname, '../../../..', 'uploads/');
    const currentNcc8FilePath = join(nccPath + currentNcc8.fileName);
    console.log('currentNcc8FilePath', currentNcc8FilePath);
    // const channel = await this.client.registerStreamingChannel({
    //   clan_id: this.clientConfigService.clandNccId,
    //   channel_id: this.clientConfigService.ncc8ChannelId,
    // });
    // if (!channel) return;
    // if (channel?.streaming_url !== '') {
    //   this.ffmpegService
    //     .transcodeMp3ToRtmp(
    //       FFmpegImagePath.NCC8,
    //       currentNcc8FilePath,
    //       channel?.streaming_url,
    //       FileType.NCC8,
    //     )
    //     .catch(async (error) => {
    //       console.log('error mp3', error);
    //       await sleep(1000);
    //       this.ffmpegService
    //         .transcodeMp3ToRtmp(
    //           FFmpegImagePath.NCC8,
    //           currentNcc8FilePath,
    //           channel?.streaming_url,
    //           FileType.NCC8,
    //         )
    //         .catch((error) => console.log('error mp3 2', error));
    //     });
    // }
  }

  @Cron('5 12 * * 5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8SummaryScheduler() {
    const currentNcc8 = await this.findCurrentNcc8Episode(FileType.NCC8);
    const currentNcc8FileName = currentNcc8?.fileName;
    console.log('currentNcc8FileName', currentNcc8FileName)
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
        embed
      },
    };
    this.messageQueue.addMessage(replyMessage);
  }
}
