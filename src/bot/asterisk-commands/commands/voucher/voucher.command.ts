import { ChannelMessage, EMarkdownType, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { generateQRCode, getRandomColor } from 'src/bot/utils/helper';
import {
  EmbedProps,
  EUserType,
  MEZON_EMBED_FOOTER,
  MEZON_IMAGE_URL,
  TransferType,
} from 'src/bot/constants/configs';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { User, VoucherEntiTy, VoucherWithDrawEntiTy } from 'src/bot/models';
import { EUserError } from 'src/bot/constants/error';
import { MezonClientService } from 'src/mezon/services/client.service';
import { DataSource } from 'typeorm';
import { ETransactionStatus } from 'src/bot/models/voucherWithdrawTransaction.entity';
import fs from 'fs';
import path from 'path';
interface VoucherUser {
  gmail: string;
  mezonId: string;
  totalAvailable: number;
}

@Command('voucher')
export class VoucherCommand extends CommandMessage {
  private client: MezonClient;
  private voucherData: VoucherUser[];
  constructor(
    private readonly axiosClientService: AxiosClientService,
    private messageQueue: MessageQueue,
    private clientConfigService: ClientConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(VoucherEntiTy)
    private voucherRepository: Repository<VoucherEntiTy>,
    @InjectRepository(VoucherWithDrawEntiTy)
    private voucherWithDrawEntiTy: Repository<VoucherWithDrawEntiTy>,
    private clientService: MezonClientService,
    private readonly dataSource: DataSource,
  ) {
    super();
    this.client = this.clientService.getClient();
    const filePath = path.resolve(
      process.cwd(),
      'src/bot/utils/transformed-output.json',
    );

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      this.voucherData = jsonData.users || [];
    } catch (err) {
      console.error('❌ Failed to load voucher data:', err);
      this.voucherData = [];
    }
  }

  private findVoucherUserBySenderId(senderId: string) {
    return this.voucherData.find((u) => u.mezonId === senderId) || null;
  }

  async handleWithdraw(message: ChannelMessage) {
    const userId = message.sender_id;
    const channelClan = await this.client.channels.fetch(message.channel_id);
    const messageClan = await channelClan.messages.fetch(message.message_id);

    // check user in DB
    const user = this.findVoucherUserBySenderId(userId);
    if (!user) {
      const msg = '❌User not found in voucher data. Please contact admin.❌';
      await messageClan.reply({
        t: msg,
        mk: [{ type: EMarkdownType.PRE, s: 0, e: msg.length }],
      });
      return;
    }

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // use pg_advisory_xact_lock block transaction by userid
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        userId,
      ]);

      // check have success transaction (1 user have only 1 transaction success)
      const alreadySuccess = await manager
        .getRepository(VoucherWithDrawEntiTy)
        .createQueryBuilder('w')
        .where('w."userId" = :userId AND w."status" = :status', {
          userId,
          status: ETransactionStatus.SUCCESS,
        })
        .setLock('pessimistic_read')
        .getExists();

      // throw if exist transaction success
      if (alreadySuccess) {
        const messageContent =
          '⛔You have successfully withdrawn your money!⛔';
        await messageClan.reply({
          t: messageContent,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
        });
        return;
      }

      // check status pending
      const existingPending = await manager
        .getRepository(VoucherWithDrawEntiTy)
        .createQueryBuilder('w')
        .where('w."userId" = :userId AND w."status" = :status', {
          userId,
          status: ETransactionStatus.PENDING,
        })
        .setLock('pessimistic_read')
        .getOne();

      // return if exist transaction pending
      if (existingPending) return;

      let rowId = null;

      // create pending transaction for init
      try {
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(VoucherWithDrawEntiTy)
          .values({
            userId,
            amount: 0,
            status: ETransactionStatus.PENDING,
            createdAt: Date.now(),
          })
          .returning(['id'])
          .execute();

        rowId = result.raw?.[0]?.id;
      } catch (e) {
        if (
          e instanceof QueryFailedError &&
          (e as any).driverError?.code === '23505'
        )
          return;
        throw e;
      }

      if (!rowId) return;

      // get blance user form voucher
      const balance = user?.totalAvailable || 0;
      // check balance
      if (balance <= 0) {
        await manager
          .createQueryBuilder()
          .update(VoucherWithDrawEntiTy)
          .set({ status: ETransactionStatus.FAIL, amount: 0 })
          .where('id = :id', { id: rowId })
          .execute();
        const messageContent = '⛔You have no money to withdraw!⛔';
        await messageClan.reply({
          t: messageContent,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
        });
        return;
      }

      // withdraw token
      try {
        const sendResult = await this.client.sendToken({
          receiver_id: userId,
          amount: balance,
          note: 'Withdraw voucher',
        });

        const status = sendResult?.ok
          ? ETransactionStatus.SUCCESS
          : ETransactionStatus.FAIL;

        // update success transaction
        await manager
          .createQueryBuilder()
          .update(VoucherWithDrawEntiTy)
          .set({ status, amount: balance })
          .where('id = :id', { id: rowId })
          .execute();

        const messageContent = `✅Withdraw ${balance.toLocaleString('vi-VN')}đ successfully!✅`;
        await messageClan.reply({
          t: messageContent,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
        });
      } catch {
        // update fail transaction
        await manager
          .createQueryBuilder()
          .update(VoucherWithDrawEntiTy)
          .set({ status: ETransactionStatus.FAIL, amount: balance })
          .where('id = :id', { id: rowId })
          .execute();
        const messageContent =
          '❌Withdrawal failed. Please contact the admin or try again!❌';
        await messageClan.reply({
          t: messageContent,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
        });
      }
    });
  }

  async execute(args: string[], message: ChannelMessage) {
    if (args[0] === 'exchange') {
      const messageContent =
        '' +
        `⚠️This service is no longer supported and will be hidden after November 1, 2025.\nPlease visit **https://dong.mezon.ai/** to continue exchanging your vouchers!` +
        '';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    //withdraw
    if (args[0] === 'withdraw') {
      try {
        await this.handleWithdraw(message);
      } catch (error) {
        console.error(
          '[Voucher withdraw] handler failed:',
          error?.message || error,
        );
      }
      return;
    }

    if (args[0] === 'balance') {
      let userEmail = args[1] || message.clan_nick || message.username;
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
        const alreadySuccess = await this.voucherWithDrawEntiTy.findOne({
          where: {
            userId: user.userId,
            status: ETransactionStatus.SUCCESS,
          },
        });
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
                value: `Available: ${(alreadySuccess ? 0 : +response?.data?.totalAvailable).toLocaleString('vi-VN')}đ\nUsed: ${(+response?.data?.totalUsed).toLocaleString('vi-VN')}đ`,
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
