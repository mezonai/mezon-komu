import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { MezonClan } from 'src/bot/models';
import { User } from 'src/bot/models/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ToggleActiveService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MezonClan)
    private readonly mezonClanRepository: Repository<MezonClan>,
  ) {}

  async findAcc(authorId) {
    return await this.userRepository.findOne({
      where: [{ userId: authorId }, { username: authorId }],
    });
  }

  async deactiveAcc(id) {
    return await this.userRepository.update(id, { deactive: true });
  }

  async ActiveAcc(id) {
    return await this.userRepository.update(id, { deactive: false });
  }

  async toggleClanCommandPermission(
    clanId: string,
    owner = '',
    clanName = '',
  ) {
    const clan = await this.mezonClanRepository.findOne({
      where: {
        clan_id: clanId,
      },
    });

    if (!clan) {
      await this.mezonClanRepository.insert({
        clan_id: clanId,
        clan_name: clanName,
        owner,
        can_use_command: true,
        createdAt: Date.now(),
      });

      return {
        clan_id: clanId,
        clan_name: clanName,
        owner,
        can_use_command: true,
      };
    }

    const canUseCommand = !clan.can_use_command;
    await this.mezonClanRepository.update(clan.clan_id, {
      clan_name: clan.clan_name || clanName,
      owner: clan.owner || owner,
      can_use_command: canUseCommand,
    });

    return {
      clan_id: clan.clan_id,
      clan_name: clan.clan_name || clanName,
      owner: clan.owner || owner,
      can_use_command: canUseCommand,
    };
  }

  async checkrole(authorId) {
    const users = await this.userRepository
      .createQueryBuilder('users')
      .where(
        '"userId" = :userId AND ("roles_discord" @> :admin OR "roles_discord" @> :hr)',
        { userId: authorId, admin: ['ADMIN'], hr: ['HR'] },
      )
      .andWhere('user_type = :userType', { userType: EUserType.MEZON })
      .select('users.*')
      .execute();
    return users;
  }
}
