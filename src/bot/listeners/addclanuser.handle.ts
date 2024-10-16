import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MentionSchedulerService } from '../scheduler/mention-scheduler.services';
import { ClientConfigService } from '../config/client-config.service';
import { MessageQueue } from '../services/messageQueue.service';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../models';
import { EUserType } from '../constants/configs';

@Injectable()
export class EventAddClanUser extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.AddClanUser)
  async handleAddClanUser(data) {
    try {
      const DMchannel = await this.client.createDMchannel(data?.user?.user_id);
      if (!DMchannel) return;
      await this.client.sendDMChannelMessage(
        DMchannel.channel_id,
        'Welcome to KOMU clan. Have a great experience!',
      );
      const dataInsert = {
        user_id: data?.user?.user_id,
        channel_id: DMchannel.channel_id,
        username: data?.user?.username,
      };

      await this.channelDmMezonRepository.insert(dataInsert);
      if (data?.user?.user_id) {
        const findUser = await this.userRepository.findOne({
          where: { userId: data?.user?.user_id },
        });

        if (findUser) {
          findUser.discriminator = '0';
          findUser.avatar = data?.user?.avatar;
          findUser.display_name = data?.user?.display_name ?? '';
          findUser.user_type = EUserType.MEZON;
          findUser.last_message_time = Date.now();
          await this.userRepository.update(
            { userId: data?.user?.user_id },
            findUser,
          );
          return;
        }

        const komuUser = {
          userId: data?.user?.user_id,
          username: data?.user?.username,
          discriminator: '0',
          avatar: data?.user?.avatar,
          bot: false,
          system: false,
          email: data?.user?.username,
          display_name: data?.user?.display_name ?? '',
          clan_nick: data?.user?.clan_nick ?? '',
          flags: 0,
          last_message_id: null,
          last_message_time: Date.now(),
          scores_quiz: 0,
          deactive: false,
          botPing: false,
          scores_workout: 0,
          not_workout: 0,
          user_type: EUserType.MEZON,
          createdAt: Date.now(),
        };

        await this.userRepository.insert(komuUser);
      }
    } catch (error) {
      console.log('give coffee', error);
    }
  }
}
