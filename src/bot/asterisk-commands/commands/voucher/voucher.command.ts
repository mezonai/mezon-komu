import {
  ChannelMessage,
  EButtonMessageStyle,
  EMessageComponentType,
} from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { generateQRCode, getRandomColor } from 'src/bot/utils/helper';
import {
  EmbedProps,
  EUserType,
  MEZON_EMBED_FOOTER,
  MEZON_IMAGE_URL,
} from 'src/bot/constants/configs';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { UserStatusService } from '../user-status/userStatus.service';
import { User, VoucherEntiTy } from 'src/bot/models';
import { EUserError } from 'src/bot/constants/error';

@Command('voucher')
export class VoucherCommand extends CommandMessage {
  constructor(
    private readonly axiosClientService: AxiosClientService,
    private messageQueue: MessageQueue,
    private clientConfigService: ClientConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(VoucherEntiTy)
    private voucherRepository: Repository<VoucherEntiTy>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (args[0] === 'exchange') {
      // const embed: EmbedProps[] = [
      //   {
      //     color: getRandomColor(),
      //     title: `VOUCHER EXCHANGE OPTION`,
      //     description: 'Select option you want to exchange voucher',
      //     fields: [
      //       {
      //         name: '',
      //         value: '',
      //         inputs: {
      //           id: `VOUCHER`,
      //           type: EMessageComponentType.RADIO,
      //           component: [
      //             {
      //               label: 'Exchange voucher NCCSoft:',
      //               value: 'voucher_NccSoft',
      //               description:
      //                 '- Quy đổi thành voucher sử dụng ở voucher.nccsoft.vn\n- Được sử dụng ở cuối tháng, giúp giảm tiền phạt\n- Nhập số tiền để quy đổi: 1 mezon token = 1 vnđ',
      //               style: EButtonMessageStyle.PRIMARY,
      //             },
      //             {
      //               label: 'Exchange voucher Market:',
      //               value: 'voucher_Market',
      //               description:
      //                 '- Quy đổi thành voucher sử dụng ở nhiều trang thương mại điện tử \n   (Vd: Shopee, Lazada, Grab...)\n- Mỗi lần quy đổi cần 100.000 mezon token (tương ứng 100.000 vnđ cho mã giảm khi thanh toán ở trang thương mại điện tử)',
      //               style: EButtonMessageStyle.PRIMARY,
      //             },
      //           ],
      //         },
      //       },
      //       {
      //         name: 'Vui lòng click Confirm để xác nhận.\nNếu không muốn giao dịch, vui lòng click Cancel!',
      //         value: '',
      //       },
      //     ],
      //     timestamp: new Date().toISOString(),
      //     footer: MEZON_EMBED_FOOTER,
      //   },
      // ];
      // const components = [
      //   {
      //     components: [
      //       {
      //         id: `voucher_CANCEL_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}`,
      //         type: EMessageComponentType.BUTTON,
      //         component: {
      //           label: `Cancel`,
      //           style: EButtonMessageStyle.SECONDARY,
      //         },
      //       },
      //       {
      //         id: `voucher_CONFIRM_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}`,
      //         type: EMessageComponentType.BUTTON,
      //         component: {
      //           label: `Confirm`,
      //           style: EButtonMessageStyle.SUCCESS,
      //         },
      //       },
      //     ],
      //   },
      // ];
      // return this.replyMessageGenerate(
      //   {
      //     embed,
      //     components,
      //   },
      //   message,
      // );
      const sendTokenData = {
        sender_id: message.sender_id,
        receiver_id: process.env.BOT_KOMU_ID,
        note: `[NccSoft Voucher Buying]`,
        extra_attribute: JSON.stringify({
          sessionId: 'buy_NccSoft_voucher',
          appId: 'buy_NccSoft_voucher',
        }),
      };
      const qrCodeImage = await generateQRCode(JSON.stringify(sendTokenData));
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          title: 'VOUCHER NCCSOFT EXCHANGE!',
          fields: [
            {
              name: 'Scan this QR code for EXCHANGE NCCSOFT VOUCHER!',
              value: '',
            },
          ],
          image: {
            url: qrCodeImage + '',
            width: '300px',
            height: '300px',
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
        '' + `Komu sent to you a message. Please check!` + '';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
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
        userEmail = findUser?.clan_nick || findUser.username;
      }
      const user = await this.userRepository.findOne({
        where: [{ clan_nick: userEmail }, { username: userEmail }],
        order: { clan_nick: 'DESC' },
      });
      if (!user) {
        return this.replyMessageGenerate(
          {
            messageContent: EUserError.INVALID_USER,
            mk: [{ type: 'pre', s: 0, e: EUserError.INVALID_USER.length }],
          },
          message,
        );
      }
      try {
        const response = await this.axiosClientService.get(
          `${this.clientConfigService.voucherApi.getTotalVoucherByEmail}/${user?.clan_nick || user.username}@ncc.asia`,
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
                name: `Total balance`,
                value: `Available: ${response?.data?.totalAvailable} đ\nUsed: ${response?.data?.totalUsed} đ`,
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
            messageContent: '' + messageContent + '',
            mk: [{ type: 'pre', s: 0, e: messageContent.length + 6 }],
          },
          message,
        );
      }
    }

    if (args[0] === 'list') {
      const vouchers = await this.voucherRepository
        .createQueryBuilder('voucher')
        .select('voucher.price', 'price')
        .addSelect(
          'COUNT(CASE WHEN voucher.active = TRUE THEN 1 END)',
          'available',
        )
        .addSelect('COUNT(CASE WHEN voucher.active = FALSE THEN 1 END)', 'used')
        .groupBy('voucher.price')
        .getRawMany();
      const fields = vouchers.map((voucher) => {
        return {
          name: `Price: ${voucher.price}`,
          value: `Available: ${voucher.available}\nUsed: ${voucher.used}`,
        };
      });
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          title: `LIST VOUCHER AVAIBLE`,
          thumbnail: {
            url: MEZON_IMAGE_URL,
          },
          fields,
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
    }

    const messageContent =
      '' +
      '1. Command: *voucher balance' +
      '\n' +
      '2. Command: *voucher balance username' +
      '\n' +
      `   Example: *voucher balance a.nguyenvan` +
      '\n' +
      '3. Command: *voucher exchange' +
      '';
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
