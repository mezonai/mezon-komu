import {
  Body,
  Controller,
  Injectable,
  Post,
  Headers,
  Res,
  Req,
  UseInterceptors,
  UsePipes,
  HttpException,
  HttpStatus,
  Get,
  StreamableFile,
  Param,
  Query,
} from '@nestjs/common';
import { GetUserIdByUsernameDTO } from '../dto/getUserIdByUsername';
import { KomubotrestService } from './komubot-rest.service';
import { SendMessageToUserDTO } from '../dto/sendMessageToUser';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { SendMessageToChannelDTO } from '../dto/sendMessageToChannel';
import { fileFilter, fileName, imageName } from '../utils/helper';
import { RegexEmailPipe } from '../middleware/regex-email';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { FileType } from '../constants/configs';
import { Uploadfile } from '../models';
import { ClientConfigService } from '../config/client-config.service';
import { google } from "googleapis";
import { parse } from 'date-fns';
import { ReportDailyService } from '../asterisk-commands/commands/report/reportDaily.service';
import { ReportWFHService } from '../utils/report-wfh.serivce';
import { ReportDailyDTO } from '../dto/reportDaily';
import { GetUserIdByEmailDTO } from '../dto/getUserIdByEmail';

@ApiTags('Komu')
@Controller()
@Injectable()
export class KomubotrestController {
  constructor(
    private komubotrestService: KomubotrestService,
    @InjectRepository(Uploadfile)
    private readonly uploadFileRepository: Repository<Uploadfile>,
    private clientConfigService: ClientConfigService,
    private reportDailyService: ReportDailyService,
    private reportWFHService: ReportWFHService
  ) {}

  @Post('/getUserIdByUsername')
  async getUserIdByUsername(
    @Body() getUserIdByUsernameDTO: GetUserIdByUsernameDTO,
    @Headers('X-Secret-Key') header,
    @Res() res: Response,
  ) {
    return this.komubotrestService.getUserIdByUsername(
      getUserIdByUsernameDTO,
      header,
      res,
    );
  }

  @Post('/sendMessageToUser')
  async sendMessageToUser(
    @Body() sendMessageToUserDTO: SendMessageToUserDTO,
    @Headers('X-Secret-Key') header,
    @Res() res: Response,
  ) {
    return this.komubotrestService.sendMessageToUser(
      sendMessageToUserDTO,
      header,
      res,
    );
  }

  @Get("/getInfoUserByEmail")
  async getInfoUser(@Query() getUserByEmailDto: GetUserIdByEmailDTO) {
    return await this.komubotrestService.getInfoUserByEmail(getUserByEmailDto);
  }

  @Get("/getUserNotDaily")
  async getUserNotDaily() {  
    return await this.komubotrestService.getUserNotDaily();
  }

  @Get("/getDailyReport")
  async getDailyReport(@Query() query: { date: string }) {
    const date = parse(query.date, 'dd/MM/yyyy', new Date());
    const { notDaily } = await this.reportDailyService.getUserNotDaily(date);
    const mention = await this.reportWFHService.reportMachleo(date);

    return { daily: notDaily, mention };
  }

  @Get("/reportDaily")
  async reportDaily(@Query() query: ReportDailyDTO) {
    return await this.komubotrestService.getReportUserDaily(query);
  }

  @Post('/uploadFile')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: fileName,
      }),
      limits: {
        fileSize: 1024 * 1024 * 100,
      },
      fileFilter: fileFilter,
    }),
  )
  async uploadFileNCC8(@Req() req: Request, @Res() res: Response) {
    const file = req.file;
    if (!file) {
      throw new HttpException('Please upload a file', HttpStatus.NOT_FOUND);
    }
    if (!req.body.episode) {
      throw new HttpException(
        'Episode can not be empty!',
        HttpStatus.NOT_FOUND,
      );
    }

    const episode = req.body.episode;
    await this.uploadFileRepository.insert({
      filePath: file.path,
      fileName: `${file.filename}`,
      createTimestamp: Date.now(),
      episode,
      file_type: FileType.NCC8,
    });
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.clientConfigService.driverClientId,
        this.clientConfigService.driverClientSecret,
        this.clientConfigService.driverRedirectId,
      );
      oauth2Client.setCredentials({
        refresh_token: this.clientConfigService.driverRefreshToken,
      });

      const drive = google.drive({
        version: 'v3',
        auth: oauth2Client,
      });

      const nccPath = join(__dirname, '../../../..', 'uploads/');
      await drive.files.create({
        requestBody: {
          name: `NCC8.${episode}_mixdown.mp3`,
          mimeType: file.mimetype,
          parents: [this.clientConfigService.driverFolderParentId],
        },
        media: {
          mimeType: file.mimetype,
          body: createReadStream(join(nccPath + file.filename)),
        },
      });
    } catch (error) {
      console.log(error.message);
    }
    res.send(file);
  }

  @Get("/ncc8/download")
  async getFile(@Res({ passthrough: true }) res: Response) {
    try {
      const nccPath = join(__dirname, "../../../..", "uploads/");

      const fileDownload = await this.komubotrestService.downloadFile();
      const file = createReadStream(join(nccPath + fileDownload[0].fileName));

      res.set({
        "Content-Type": "audio/mp3",
        "Content-Disposition": `attachment; filename=${fileDownload[0].fileName}`,
      });
      return new StreamableFile(file);
    } catch (error) {
      console.log(error);
    }
  }

  @Get("/ncc8/episode/:episode")
  async getNcc8Episode(
    @Param('episode') episode: string,
    // @Res({ passthrough: true }) res: Response
    @Res() res: Response
  ) {
    try {
      const file = await this.komubotrestService.getNcc8Episode(episode, FileType.NCC8);
      if (!file?.length) {
        res.status(404).send({ message: 'Not found' });
        return;
      }

      const nccPath = join(__dirname, "../../../..", "uploads/");
      res.status(200).json({ url: join(nccPath + file[0].fileName) })
    } catch (error) {
      console.error('getNcc8Episode error', error);
      res.status(500).send({ message: 'Server error' });
    }
  }

  @Get("/ncc8/film/:episode")
  async getNcc8Film(
    @Param('episode') episode: string,
    @Res() res: Response
  ) {
    try {
      const file = await this.komubotrestService.getNcc8Episode(episode, FileType.FILM);
      if (!file?.length) {
        res.status(404).send({ message: 'Not found' });
        return;
      }

      const nccPath = "/home/nccsoft/projects/uploads/";

      res.status(200).json({ url: join(nccPath + file[0].fileName) })
    } catch (error) {
      console.error('getNcc8Episode error', error);
      res.status(500).send({ message: 'Server error' });
    }
  }

  @Get("/ncc8/audio-book/:episode")
  async getNcc8AudioBook(
    @Param('episode') episode: string,
    @Res() res: Response
  ) {
    try {
      const file = await this.komubotrestService.getNcc8Episode(episode, FileType.AUDIOBOOK);
      if (!file?.length) {
        res.status(404).send({ message: 'Not found' });
        return;
      }

      const nccPath = "/home/nccsoft/projects/uploads/";

      res.status(200).json({ url: join(nccPath + file[0].fileName) })
    } catch (error) {
      console.error('getNcc8Episode error', error);
      res.status(500).send({ message: 'Server error' });
    }
  }
}
