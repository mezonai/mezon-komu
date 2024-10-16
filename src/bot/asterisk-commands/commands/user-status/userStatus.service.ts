import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { User } from 'src/bot/models/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UserStatusService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getUserByEmail(email) {
    return await this.userRepository
      .createQueryBuilder()
      .where(`"email" = :email`, { email: email })
      .orWhere(`"username" = :username`, { username: email })
      .andWhere('user_type = :userType', { userType: EUserType.MEZON })
      .select('*')
      .execute();
  }
}
