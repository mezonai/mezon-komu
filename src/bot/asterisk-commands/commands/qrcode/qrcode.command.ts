import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';
import * as QRCode from 'qrcode';
import { EmbedProps, EUserType } from 'src/bot/constants/configs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/bot/models';
import { EUserError } from 'src/bot/constants/error';
import { getRandomColor } from 'src/bot/utils/helper';

@Command('qr')
export class QRCodeCommand extends CommandMessage {
  constructor(
    private dynamicCommandService: DynamicCommandService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
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
          '(user.email = :query OR user.username = :query OR user.userId = :query)',
          { query: args[0] },
        )
        .andWhere('user.user_type = :userType', { userType: EUserType.MEZON })
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
          mk: [{ type: 't', s: 0, e: EUserError.INVALID_USER.length }],
        },
        message,
      );
    const sendTokenData = {
      sender_id: message.sender_id,
      receiver_id: findUser.userId,
      receiver_name: findUser.username,
    };
    const qrCodeDataUrl = await QRCode.toDataURL(
      JSON.stringify(sendTokenData),
      {
        errorCorrectionLevel: 'L',
      },
    );
    const embed: EmbedProps[] = [{
      color: getRandomColor(),
      title: `QR send token to ${findUser.username}`,
      image: {
        url: qrCodeDataUrl,
      },
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Powered by Mezon',
        icon_url:
          'https://cdn.mezon.vn/1837043892743049216/1840654271217930240/1827994776956309500/857_0246x0w.webp',
      },
    }];
    return this.replyMessageGenerate(
      {
        embed,
      },
      message,
    );
  }
}
