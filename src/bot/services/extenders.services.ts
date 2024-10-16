import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../models/user.entity';
import { ChannelMessage } from 'mezon-sdk';
import { EUserType } from '../constants/configs';

@Injectable()
export class ExtendersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async addDBUser(message: ChannelMessage) {
    if (message.sender_id === '1767478432163172999') return; // ignored anonymous user
    const findUser = await this.userRepository.findOne({
      where: { userId: message.sender_id },
    });

    if (findUser) {
      findUser.userId = message.sender_id;
      findUser.username = message.username;
      findUser.discriminator = '0';
      findUser.avatar = message.avatar;
      findUser.bot = false;
      findUser.system = false;
      findUser.email = message.username;
      findUser.display_name = message.display_name ?? '';
      findUser.clan_nick = message.clan_nick ?? '';
      findUser.user_type = EUserType.MEZON;
      findUser.flags = 0;
      findUser.last_message_id = message.message_id;
      findUser.last_message_time = Date.now();
      findUser.deactive = false;
      findUser.botPing = findUser.botPing;
      findUser.scores_workout = 0;
      findUser.not_workout = 0;
      await this.userRepository.save(findUser);
      return;
    }

    const komuUser = {
      userId: message.sender_id,
      username: message.username,
      discriminator: '0',
      avatar: message.avatar,
      bot: false,
      system: false,
      email: message.username,
      display_name: message.display_name ?? '',
      clan_nick: message.clan_nick ?? '',
      flags: 0,
      last_message_id: message.message_id,
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
}
