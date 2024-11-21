import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { RoleMezon, User } from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class EventRoleAsign extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RoleMezon)
    private roleMezonRepository: Repository<RoleMezon>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.RoleAssign)
  async handleRoleAsignEvent(data) {
    try {
      if (data.ClanId !== process.env.KOMUBOTREST_CLAN_NCC_ID) return;
      if (data.user_ids_assigned.length) {
        data.user_ids_assigned.forEach(async (userId) => {
          const findUser = await this.userRepository.findOne({
            where: { userId },
          });
          const roles = Array.isArray(findUser.roles) ? findUser.roles : [];
          if (findUser && !roles.includes(data.role_id)) {
            await this.userRepository.update(
              { userId },
              { roles: [...roles, data.role_id] },
            );
          }
        });
      }
      if (data.user_ids_removed.length) {
        data.user_ids_removed.forEach(async (userId) => {
          const findUser = await this.userRepository.findOne({
            where: { userId },
          });
          const roles = Array.isArray(findUser.roles) ? findUser.roles : [];
          if (findUser) {
            await this.userRepository.update(
              { userId },
              {
                roles: [
                  ...roles?.filter((role_id) => role_id !== data.role_id),
                ],
              },
            );
          }
        });
      }
    } catch (error) {}
  }
}
