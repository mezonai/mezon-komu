import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { User } from 'src/bot/models/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ToggleActiveService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
