import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { UserStatusService } from '../user-status/userStatus.service';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { EmbedProps, EUserType } from 'src/bot/constants/configs';
import { EUserError } from 'src/bot/constants/error';
import { MezonClientService } from 'src/mezon/services/client.service';
import { getRandomColor } from 'src/bot/utils/helper';

@Command('avatar')
export class AvatarCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientService: MezonClientService,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent: string;
    let userQuery: string;

    if (Array.isArray(message.references) && message.references.length) {
      userQuery = message.references[0].message_sender_username;
    } else {
      if (
        Array.isArray(message.mentions) &&
        message.mentions.length &&
        args[0]?.startsWith('@')
      ) {
        const findUser = await this.userRepository.findOne({
          where: {
            userId: message.mentions[0].user_id,
            user_type: EUserType.MEZON,
          },
        });
        userQuery = findUser.username;
      } else {
        userQuery = args.length ? args[0] : message.username;
      }

      //check fist arg
      const findUserArg = await this.userRepository
        .createQueryBuilder('user')
        .where(
          '(user.clan_nick = :query OR user.username = :query OR user.userId = :query)',
          { query: args[0] },
        )
        .orderBy(
          'CASE WHEN user.clan_nick = :query THEN 1 WHEN user.username = :query THEN 2 ELSE 3 END',
        )
        .getOne();
      if (findUserArg) {
        userQuery = findUserArg.username;
      }
    }

    const findUser = await this.userRepository.findOne({
      where: { username: userQuery, user_type: EUserType.MEZON },
    });

    if (!findUser)
      return this.replyMessageGenerate(
        {
          messageContent: EUserError.INVALID_USER,
          mk: [{ type: 'pre', s: 0, e: EUserError.INVALID_USER.length }],
        },
        message,
      );
    if (!findUser.avatar) {
      const messageContent =
        'Not found or this person has not uploaded an avatar yet!';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `${findUser.clan_nick || findUser.username}'s avatar`,
        author: {
          name: findUser.clan_nick || findUser.username,
          icon_url: findUser.avatar,
          url: findUser.avatar,
        },
        image: {
          url: findUser.avatar,
          width: '400px',
          height: '400px',
        },
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Powered by Mezon',
          icon_url:
            'https://cdn.mezon.vn/1837043892743049216/1840654271217930240/1827994776956309500/857_0246x0w.webp',
        },
      },
    ];

    return this.replyMessageGenerate(
      {
        embed,
      },
      message,
    );
  }
}
