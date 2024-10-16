import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BotGateway } from './bot/events/bot.gateway';
// import { MentionSchedulerService } from './bot/scheduler/mention-scheduler.services';
import { MentionSchedulerService } from './bot/scheduler/mention-scheduler.services';
import { SendMessageSchedulerService } from './bot/scheduler/send-message-scheduler.services';
import { MeetingSchedulerService } from './bot/scheduler/meeting-scheduler.services';
import { setupSwagger } from './setup-swagger';
import { KomubotrestService } from './bot/komubot-rest/komubot-rest.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  setupSwagger(app);
  const bot = app.get(BotGateway);
  bot.initEvent();

  // start cronjob machleo
  const mentionSchedulerService = app.get(MentionSchedulerService);
  await mentionSchedulerService.startCronJobs();

  // start cronjob message note
  const sendMessageSchedulerService = app.get(SendMessageSchedulerService);
  await sendMessageSchedulerService.startCronJobs();

  const komubotrestService = app.get(KomubotrestService);
  await komubotrestService.startWatchingFolder();

  await app.listen(3000);
}
bootstrap();
