import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { generateQRCode, getRandomColor } from 'src/bot/utils/helper';
import {
  EmbedProps,
  EUserType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { UserStatusService } from '../user-status/userStatus.service';
import { User } from 'src/bot/models';
import { EUserError } from 'src/bot/constants/error';

@Command('voucher')
export class VoucherCommand extends CommandMessage {
  constructor(
    private readonly axiosClientService: AxiosClientService,
    private messageQueue: MessageQueue,
    private clientConfigService: ClientConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (args[0] === 'exchange') {
      const sendTokenData = {
        sender_id: message.sender_id,
        receiver_id: process.env.BOT_KOMU_ID,
        note: `[Voucher Buying]`,
        extra_attribute: JSON.stringify({
          sessionId: 'buy_voucher',
          appId: 'buy_voucher',
        }),
      };
      const qrCodeImage = await generateQRCode(JSON.stringify(sendTokenData));
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          fields: [
            {
              name: 'Scan this QR code for UNLOCK TIMESHEET!',
              value: '',
            },
          ],
          image: {
            url: qrCodeImage + '',
          },
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const messageToUser: ReplyMezonMessage = {
        userId: message.sender_id,
        textContent: '',
        messOptions: { embed },
      };
      this.messageQueue.addMessage(messageToUser);
      const messageContent =
        '```' + `Komu sent to you a message. Please check!` + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'balance') {
      let userEmail = args[1] ?? message.clan_nick;
      if (
        Array.isArray(message.mentions) &&
        message.mentions.length &&
        args[1]?.startsWith('@')
      ) {
        const findUser = await this.userRepository.findOne({
          where: {
            userId: message.mentions[0].user_id,
            user_type: EUserType.MEZON,
          },
        });
        userEmail = findUser?.clan_nick ?? 'null';
      }
      const user = await this.userRepository.findOne({
        where: { clan_nick: userEmail },
      });
      if (!user) {
        return this.replyMessageGenerate(
          {
            messageContent: EUserError.INVALID_USER,
            mk: [{ type: 't', s: 0, e: EUserError.INVALID_USER.length }],
          },
          message,
        );
      }
      try {
        const response = await this.axiosClientService.get(
          `${this.clientConfigService.voucherApi.getTotalVoucherByEmail}/${user.clan_nick}@ncc.asia`,
          {
            headers: {
              'X-Secret-Key': process.env.VOUCHER_X_SECRET_KEY,
            },
          },
        );
        if (!response?.data) return;
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `${userEmail}'s voucher information`,
            fields: [
              {
                name: `Email`,
                value: `${response?.data?.gmail}`,
              },
              {
                name: `Total Voucher`,
                value: `Available: ${response?.data?.totalAvailable} đ`,
              },
            ],
            author: {
              name: message.clan_nick,
              icon_url: message.avatar,
              url: message.avatar,
            },
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];

        return this.replyMessageGenerate(
          {
            embed,
          },
          message,
        );
      } catch (error) {
        let messageContent = error?.response?.data?.message ?? 'Error';
        if (error?.response?.data?.statusCode === 404) {
          messageContent =
            'User not found! Please go https://voucher.nccsoft.vn/ to create an account.';
        }
        return this.replyMessageGenerate(
          {
            messageContent: '```' + messageContent + '```',
            mk: [{ type: 't', s: 0, e: messageContent.length + 6 }],
          },
          message,
        );
      }
    }

    const messageContent =
      '```' +
      '1. Command: *voucher balance' +
      '\n' +
      '2. Command: *voucher balance username' +
      '\n' +
      `   Example: *voucher balance a.nguyenvan` +
      '\n' +
      '3. Command: *voucher exchange' +
      '```';
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
