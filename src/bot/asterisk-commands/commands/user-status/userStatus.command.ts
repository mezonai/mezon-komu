import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { UserStatusService } from './userStatus.service';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { EUserStatusCommand } from './userStatus.constants';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { User } from 'src/bot/models';
import { Repository, IsNull } from 'typeorm';

@Command('userstatus')
export class UserStatusCommand extends CommandMessage {
  constructor(
    private userStatusService: UserStatusService,
    private readonly clientConfig: ClientConfigService,
    private readonly axiosClientService: AxiosClientService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent;
    let userQuery = '';
    if (Array.isArray(message.references) && message.references.length) {
      userQuery = message.references[0].message_sender_username;
    } else {
      if (
        Array.isArray(message.mentions) &&
        message.mentions.length &&
        args[0]?.startsWith('@')
      ) {
        const findUser = await this.userRepository.findOne({
          where: [
            {
              userId: message.mentions[0].user_id,
              user_type: EUserType.MEZON,
            },
            {
              userId: message.mentions[0].user_id,
              user_type: IsNull(),
            },
          ],
        });
        userQuery = findUser?.userId;
      } else {
        userQuery = args.length ? args[0] : message.sender_id;
      }

      const emailWithDomain = args[0]?.includes('@')
        ? args[0]
        : `${args[0]}@ncc.asia`;

      //check fist arg
      const findUserArg = await this.userRepository
        .createQueryBuilder('user')
        .where(
          '(user.clan_nick = :query OR user.username = :query OR user.userId = :query OR user.email = :query OR user.email = :emailWithDomain OR user.display_name = :query)',
          { query: args[0], emailWithDomain },
        )
        .andWhere('(user.user_type = :userType OR user.user_type IS NULL)', {
          userType: EUserType.MEZON,
        })
        .orderBy(
          'CASE WHEN user.clan_nick = :query THEN 1 WHEN user.username = :query THEN 2 WHEN user.email = :query THEN 3 ELSE 4 END',
        )
        .getOne();
      if (findUserArg) {
        userQuery = findUserArg.userId;
      }
    }

    const emailWithDomainUserQuery = userQuery.includes('@')
      ? userQuery
      : `${userQuery}@ncc.asia`;

    const findUser = await this.userRepository
      .createQueryBuilder('user')
      .where(
        '(user.clan_nick = :query OR user.username = :query OR user.userId = :query OR user.email = :query OR user.email = :emailWithDomain OR user.display_name = :query)',
        { query: userQuery, emailWithDomain: emailWithDomainUserQuery },
      )
      .andWhere('(user.user_type = :userType OR user.user_type IS NULL)', {
        userType: EUserType.MEZON,
      })
      .getOne();

    if (!findUser) {
      messageContent = EUserStatusCommand.WRONG_EMAIL;
    } else {
      const username =
        findUser?.clan_nick || findUser?.email || findUser?.username;
      const cleanUsername = username.replace(/@ncc\.asia$/i, '').toLowerCase();
      const url = `${this.clientConfig.user_status.api_url_userstatus}?emailAddress=${cleanUsername}@ncc.asia`;
      const response = await this.axiosClientService.get(url);

      const getUserStatus = response.data;
      if (!getUserStatus) return;

      messageContent =
        `${username}'s status:\n` +
        (getUserStatus.result.length
          ? getUserStatus.result.map((item) => `- ` + item.message).join('\n')
          : `- ` + EUserStatusCommand.WORK_AT_HOME);
    }

    return this.replyMessageGenerate(
      { messageContent, mk: [{ type: 'pre', s: 0, e: messageContent.length }] },
      message,
    );
  }
}
