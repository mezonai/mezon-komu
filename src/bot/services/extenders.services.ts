import { Injectable } from '@nestjs/common';
import { IsNull, Not, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../models/user.entity';
import { UserClanProfile } from '../models/userClanProfile.entity';
import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { EUserType } from '../constants/configs';
import { MezonClientService } from 'src/mezon/services/client.service';
@Injectable()
export class ExtendersService {
  private client: MezonClient;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserClanProfile)
    private userClanProfileRepository: Repository<UserClanProfile>,
    private clientService: MezonClientService,
  ) {
    this.client = this.clientService.getClient();
  }

  async addDBUser(message: ChannelMessage) {
    if (message.sender_id === '1767478432163172999') return; // ignored anonymous user
    const now = Date.now();
    const findUser = await this.userRepository.findOne({
      where: { userId: message.sender_id },
    });

    if (findUser) {
      findUser.userId = message.sender_id;
      findUser.username = message.username;
      findUser.discriminator = '0';
      findUser.avatar = message.clan_avatar || message.avatar;
      findUser.bot = false;
      findUser.system = false;
      findUser.email = message.username;
      findUser.display_name = message.display_name ?? '';
      findUser.clan_nick = message.clan_nick ? message.clan_nick : findUser.clan_nick;
      findUser.user_type = EUserType.MEZON;
      findUser.flags = 0;
      findUser.last_message_id = message.message_id;
      findUser.last_message_time = now;
      findUser.deactive = findUser.deactive;
      findUser.botPing = findUser.botPing;
      findUser.scores_workout = 0;
      findUser.not_workout = 0;
      await this.userRepository.save(findUser);
      await this.upsertUserClanProfile(message, now);
      return;
    }

    const komuUser = {
      userId: message.sender_id,
      username: message.username,
      discriminator: '0',
      avatar: message.clan_avatar || message.avatar,
      bot: false,
      system: false,
      email: message.username,
      display_name: message.display_name ?? '',
      clan_nick: message.clan_nick ?? '',
      flags: 0,
      last_message_id: message.message_id,
      last_message_time: now,
      scores_quiz: 0,
      deactive: false,
      botPing: false,
      scores_workout: 0,
      not_workout: 0,
      user_type: EUserType.MEZON,
      createdAt: now,
    };

    await this.userRepository.insert(komuUser);
    await this.upsertUserClanProfile(message, now);
  }

  private async upsertUserClanProfile(
    message: ChannelMessage,
    now: number,
  ): Promise<void> {
    if (!message.clan_id || message.clan_id === '0') return;

    const profileData = {
      userId: message.sender_id,
      clan_id: message.clan_id,
      username: message.username,
      display_name: message.display_name ?? '',
      clan_nick: message.clan_nick ?? '',
      avatar: message.avatar,
      clan_avatar: message.clan_avatar || message.avatar,
      last_message_id: message.message_id,
      last_message_time: now,
      deactive: false,
    };

    await this.userClanProfileRepository
      .createQueryBuilder()
      .insert()
      .into(UserClanProfile)
      .values({ ...profileData, createdAt: now })
      .orUpdate(
        [
          'username',
          'display_name',
          'clan_nick',
          'avatar',
          'clan_avatar',
          'last_message_id',
          'last_message_time',
          'deactive',
        ],
        ['userId', 'clan_id'],
      )
      .execute();
  }
}
