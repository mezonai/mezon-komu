import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { EmbedProps, EUserType, MEZON_EMBED_FOOTER } from 'src/bot/constants/configs';
import { EUserError } from 'src/bot/constants/error';
import moment from 'moment';
import { getRandomColor } from 'src/bot/utils/helper';

// TODO: canot get user data from MEZON
@Command('userinfo')
export class UserInfoCommand extends CommandMessage {
  constructor(
    private readonly clientConfigService: ClientConfigService,
    private readonly axiosClientService: AxiosClientService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
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
          where: {
            userId: message.mentions[0].user_id,
            user_type: EUserType.MEZON,
          },
        });
        userQuery = findUser?.userId;
      } else {
        userQuery = args.length ? args[0] : message.sender_id;
      }

      //check fist arg
      const findUserArg = await this.userRepository
        .createQueryBuilder('user')
        .where(
          '(user.clan_nick = :query OR user.username = :query OR user.userId = :query)',
          { query: args[0] },
        )
        .andWhere('user.user_type = :userType', { userType: EUserType.MEZON })
        .orderBy('CASE WHEN user.clan_nick = :query THEN 1 WHEN user.username = :query THEN 2 ELSE 3 END')
        .getOne();
      if (findUserArg) {
        userQuery = findUserArg.userId;
      }
    }

    const findUser = await this.userRepository
      .createQueryBuilder('user')
      .where(
        '(user.clan_nick = :query OR user.username = :query OR user.userId = :query)',
        { query: userQuery },
      )
      .andWhere('user.user_type = :userType', { userType: EUserType.MEZON })
      .getOne();

    if (!findUser)
      return this.replyMessageGenerate(
        {
          messageContent: EUserError.INVALID_USER,
          mk: [{ type: 'pre', s: 0, e: EUserError.INVALID_USER.length }],
        },
        message,
      );

    const username = findUser.clan_nick || findUser.username

    const email = username.toLowerCase() + '@ncc.asia';
    const { wiki, project, wikiApiKeySecret } = this.clientConfigService;
    const httpsAgent = this.clientConfigService.https;
    const headers = { 'X-Secret-Key': wikiApiKeySecret };

    const [userData, pmData] = await Promise.all([
      this.axiosClientService.get(`${wiki.api_url}${email}`, {
        httpsAgent,
        headers,
      }),
      this.axiosClientService.get(`${project.getPMOfUser}?email=${email}`, {
        httpsAgent,
      }),
    ]);

    const projectData = pmData?.data?.result?.[0];
    const projectInfo = project
      ? `${projectData?.projectName} (${projectData?.projectCode}) - PM ${projectData?.pm?.fullName || 'Unknown'}`
      : '';

    const accountCreatedAt = moment(
      parseInt(findUser.createdAt.toString()),
    ).utcOffset(420);

    const phoneNumber =
      (userData as any)?.data?.result?.phoneNumber ?? '(no information)';
    const fullName =
      (userData as any)?.data?.result?.employeeName ?? '(no information)';
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `${findUser.clan_nick || findUser.username}'s infomation`,
        author: {
          name: findUser.clan_nick || findUser.username,
          icon_url: findUser.avatar,
          url: findUser.avatar,
        },
        thumbnail: {
          url: findUser.avatar,
        },
        fields: [
          {
            name: `• Username`,
            value: `  ${findUser.username}`,
          },
          {
            name: `• Full Name`,
            value: `  ${fullName}`,
          },
          {
            name: `• Id`,
            value: `  ${findUser.userId}`,
          },
          {
            name: `• Account creation`,
            value: `  ${accountCreatedAt.format('HH:mm DD-MM-YYYY')} (${accountCreatedAt.fromNow()})`,
          },
          {
            name: `• Phone`,
            value: `  ${phoneNumber}`,
          },
          {
            name: `• Project`,
            value: `  ${projectData ? projectInfo : '(no information)'}`,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER
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
