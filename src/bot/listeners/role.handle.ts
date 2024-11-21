import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Events, UserChannelRemovedEvent } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { BOT_ID } from '../constants/configs';
import { RoleMezon } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class EventRole extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(RoleMezon)
    private roleMezonRepository: Repository<RoleMezon>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.RoleEvent)
  async handleRoleEvent(data) {
    try {
      if (!data?.role?.id) return;
      const findRole = await this.roleMezonRepository.findOne({
        where: { id: data?.role?.id },
      });
      if (findRole) {
        this.roleMezonRepository.update(
          { id: findRole.id },
          {
            title: data.role.title,
            role_user_list: !data.role.role_user_list
              ? findRole.role_user_list
              : data.role.role_user_list,
            permission_list: !data.role.permission_list
              ? findRole.permission_list
              : data.role.permission_list,
          },
        );
      }

      if (data?.role?.active) {
        this.roleMezonRepository.insert(data?.role);
      }
    } catch (error) {
      console.log('RoleEvent', error);
    }
  }
}
