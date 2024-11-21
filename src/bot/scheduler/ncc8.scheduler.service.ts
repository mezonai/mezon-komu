import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { sleep } from '../utils/helper';
import { KomubotrestService } from '../komubot-rest/komubot-rest.service';
import { Uploadfile } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FFmpegImagePath, FileType } from '../constants/configs';
import { join } from 'path';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MezonClient } from 'mezon-sdk';
import { ClientConfigService } from '../config/client-config.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class Ncc8SchedulerService {
  private client: MezonClient;
  constructor(
    private ffmpegService: FFmpegService,
    @InjectRepository(Uploadfile)
    private uploadFileData: Repository<Uploadfile>,
    private clientService: MezonClientService,
    private clientConfigService: ClientConfigService,
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

  @Cron('29 11 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async ncc8Scheduler() {
    await sleep(42000);
    this.ffmpegService.killCurrentStream(FileType.NCC8);
    await sleep(2000);
    const currentNcc8 = await this.findCurrentNcc8Episode(FileType.NCC8);
    const nccPath = join(__dirname, '../../../..', 'uploads/');
    const currentNcc8FilePath = join(nccPath + currentNcc8.fileName);
    console.log('currentNcc8FilePath', currentNcc8FilePath);
    const channel = await this.client.registerStreamingChannel({
      clan_id: this.clientConfigService.clandNccId,
      channel_id: this.clientConfigService.ncc8ChannelId,
    });
    if (!channel) return;
    if (channel?.streaming_url !== '') {
      this.ffmpegService
        .transcodeMp3ToRtmp(
          FFmpegImagePath.NCC8,
          currentNcc8FilePath,
          channel?.streaming_url,
          FileType.NCC8,
        )
        .catch((error) => console.log('error mp3', error));
    }
  }
}
