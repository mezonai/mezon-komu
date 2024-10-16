import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, UserClanRemovedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ClientConfigService } from '../config/client-config.service';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../models';

@Injectable()
export class EventUserClanRemoved extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientConfigService: ClientConfigService,
  ) {
    super(clientService);
  }

  @OnEvent(Events.UserClanRemoved)
  async handleAddClanUser(data: UserClanRemovedEvent) {
    try {
      if (
        data?.user_ids?.length &&
        data?.clan_id === this.clientConfigService.clandNccId
      ) {
        await Promise.all(
          data?.user_ids.map(async (userId) => {
            const findUser = await this.userRepository.findOne({
              where: { userId: userId },
            });

            if (findUser) {
              await this.userRepository.update(
                { userId: userId },
                { deactive: true, user_type: null },
              );
            }
          }),
        );
      }
    } catch (error) {
      console.log('remove user clan', error);
    }
  }
}
