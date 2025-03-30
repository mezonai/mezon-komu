import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceOrder, MenuOrder, MenuOrderMessage, User } from '../models';
import { MessageQueue } from './messageQueue.service';
import {
  EmbebButtonType,
  EmbedProps,
  EMessageComponentType,
  EMessageMode,
  MEZON_EMBED_FOOTER,
  StatusInvoiceType,
  TypeOrderMessage,
} from '../constants/configs';
import { EButtonMessageStyle, MezonClient } from 'mezon-sdk';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { getRandomColor } from '../utils/helper';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { UtilsService } from './utils.services';

@Injectable()
export class MenuOrderService {
  private client: MezonClient;
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(MenuOrder)
    private menuOrderRepository: Repository<MenuOrder>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(MenuOrderMessage)
    private menuOrderMessageRepository: Repository<MenuOrderMessage>,
    @InjectRepository(InvoiceOrder)
    private invoiceOrderRepository: Repository<InvoiceOrder>,
    private utilsService: UtilsService,
    private messageQueue: MessageQueue,
  ) {
    this.client = this.clientService.getClient();
  }

  async handelSelectMenuOrder(data) {
    try {
      const [_, typeButtonRes, authId, clanId, mode, isPublic, channelId] =
        data.button_id.split('_');
      const dataParse = JSON.parse(data.extra_data || '{}');
      const itemId = dataParse?.MENU?.[0].split('_')?.[1];
      const findUserClick = await this.userRepository.findOne({
        where: { userId: data.user_id },
      });
      if (typeButtonRes === EmbebButtonType.ORDER) {
        await this.handleButtonOrder(data, itemId, findUserClick, channelId);
      }

      if (typeButtonRes === EmbebButtonType.CONFIRM) {
        await this.handleConfirmOrder(data);
      }

      if (typeButtonRes === EmbebButtonType.REPORT) {
        await this.handleReportOrder(
          clanId,
          channelId,
          isPublic,
          mode,
          findUserClick,
        );
      }

      if (typeButtonRes === EmbebButtonType.FINISH) {
        const orderItem = await this.menuOrderRepository.findOne({
          where: { id: itemId },
        });
        await this.handleReportOrder(
          clanId,
          channelId,
          isPublic,
          mode,
          findUserClick,
          true,
          orderItem.seller,
        );

        await this.invoiceOrderRepository.update(
          { channelId, status: StatusInvoiceType.APPROVE },
          { status: StatusInvoiceType.FINISH },
        );
      }
    } catch (error) {}
  }

  async handleReportOrder(
    clanId,
    channelId,
    isPublic,
    mode,
    findUserClick,
    isFinish?,
    sellerId?,
  ) {
    if (
      isFinish &&
      (findUserClick.userId !== sellerId ||
        findUserClick.userId !== '1827994776956309504')
    ) {
      const content =
        '```' + `❌You have no permission to finish this menu!` + '```';
      const messageToUser: ReplyMezonMessage = {
        userId: findUserClick.userId,
        textContent: content,
        messOptions: {
          mk: [{ type: 't', s: 0, e: content.length }],
        },
      };
      this.messageQueue.addMessage(messageToUser);
      return;
    }
    let messages = 'Không có yêu cầu order nào được chấp nhận';
    const arrayUser = await this.invoiceOrderRepository
      .createQueryBuilder('invoice')
      .select('buyer')
      .addSelect('MAX("createdAt")', 'timeStamp')
      .where(`"channelId" = :channelId`, { channelId })
      .andWhere(`"status" = :status`, { status: EmbebButtonType.APPROVE })
      .andWhere(`"createdAt" > :yesterday`, {
        yesterday: this.utilsService.getYesterdayDate() + 60000 * 60 * 7,
      })
      .andWhere(`"createdAt" < :tomorrow`, {
        tomorrow: this.utilsService.getTomorrowDate() + 60000 * 60 * 7,
      })
      .groupBy('buyer')
      .execute();
    if (arrayUser.length) {
      const listInvoice = await this.invoiceOrderRepository
        .createQueryBuilder('invoice')
        .where('"createdAt" IN (:...time_stamps)', {
          time_stamps: arrayUser.map((item) => item.timeStamp),
        })
        .select('invoice.*')
        .execute();
      const messagesArray = await Promise.all(
        listInvoice.map(async (list) => {
          const findItem = await this.menuOrderRepository.findOne({
            where: { id: list.itemId },
          });

          const findBuyer = await this.userRepository.findOne({
            where: { userId: list.buyer },
          });

          return findItem && findBuyer
            ? `<${findBuyer.clan_nick || findBuyer.username}> order ${findItem.name.toUpperCase()}`
            : null;
        }),
      );
      const text = isFinish
        ? `Chốt đơn!!! Tổng order lần này là ${listInvoice.length} người: \n\n`
        : `Danh sách order lần này tổng là ${listInvoice.length} người: \n\n`;
      messages = text + messagesArray.filter((msg) => msg !== null).join('\n');
    }

    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `${isFinish ? 'Finish' : 'Report'} order by ${findUserClick.clan_nick || findUserClick.clan_nick}`,
        description: '```' + messages + '```',
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const replyMessage = {
      clan_id: clanId,
      channel_id: channelId,
      is_public: isPublic === 'true' ? true : false,
      is_parent_public: false,
      parent_id: '0',
      mode,
      msg: {
        embed,
      },
    };
    this.messageQueue.addMessage(replyMessage);
    if (isFinish) {
      if (
        findUserClick.userId !== sellerId ||
        findUserClick.userId !== '1827994776956309504'
      ) {
        const content =
          '```' + `❌You have no permission to finish this menu!` + '```';
        const messageToUser: ReplyMezonMessage = {
          userId: findUserClick.userId,
          textContent: content,
          messOptions: {
            mk: [{ type: 't', s: 0, e: content.length }],
          },
        };
        this.messageQueue.addMessage(messageToUser);
        return;
      }
      const findMessageOrderExist = await this.menuOrderMessageRepository.find({
        where: {
          channelId,
          clanId,
          isEdited: false,
          type: TypeOrderMessage.CREATE,
        },
      });
      if (findMessageOrderExist.length > 0) {
        const newMessageContent =
          '```' +
          'This menu has been closed, create another menu using *menu!' +
          '```';
        for (const {
          id,
          clanId,
          channelId,
          mode,
          isPublic,
          messageId,
        } of findMessageOrderExist) {
          await this.client.updateChatMessage(
            clanId,
            channelId,
            mode,
            isPublic,
            messageId,
            {
              t: newMessageContent,
              mk: [{ type: 't', s: 0, e: newMessageContent.length }],
            },
            [],
            [],
            true,
          );

          await this.menuOrderMessageRepository.update(
            { id },
            { isEdited: true },
          );
        }
      }
    }
  }

  async handleButtonOrder(data, itemId, findUserClick, channelId) {
    // find item
    const orderItem = await this.menuOrderRepository.findOne({
      where: { id: itemId },
    });
    // find seller
    const findSeller = await this.userRepository.findOne({
      where: { userId: orderItem.seller },
    });
    if (findSeller.userId === findUserClick.userId) {
      const embedBuyer: EmbedProps[] = [
        {
          color: '#57F287',
          title: `ORDER REQUEST SUCCESS`,
          fields: [
            {
              name: `Order <${orderItem.name}> success!`,
              value: '',
            },
          ],
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const messageToBuyer: ReplyMezonMessage = {
        userId: findSeller.userId,
        textContent: '',
        messOptions: { embed: embedBuyer },
      };
      this.messageQueue.addMessage(messageToBuyer);

      const invoiceOrder = new InvoiceOrder();
      invoiceOrder.itemId = itemId;
      invoiceOrder.buyer = findSeller.userId;
      invoiceOrder.seller = findSeller.userId;
      invoiceOrder.status = StatusInvoiceType.APPROVE;
      invoiceOrder.createdAt = Date.now();
      invoiceOrder.channelId = channelId;
      await this.invoiceOrderRepository.save(invoiceOrder);

      return;
    }
    // find DM channel seller
    const findSellerDMChannel = await this.channelDmMezonRepository.findOne({
      where: { user_id: orderItem.seller },
    });
    let newDMChannel;
    if (findSellerDMChannel) {
      newDMChannel = await this.clientService.createDMchannel(orderItem.seller);
    }
    const embedSeller: EmbedProps[] = [
      {
        color: '#FFFF00',
        title: `ORDER REQUEST`,
        fields: [
          {
            name: `<${findUserClick.clan_nick || findUserClick.username}> wants to order <${orderItem.name}>. Please confirm the request!`,
            value: '',
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const componentsSeller = [
      {
        components: [
          {
            id: `menu_CONFIRM_REJECT_${data.user_id}_${findUserClick.clan_nick || findUserClick.username}_${findSeller.clan_nick || findSeller.username}_${findSeller.userId}_${orderItem.name}_${orderItem.id}_${channelId}_${findSellerDMChannel?.channel_id || newDMChannel?.channel_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Reject`,
              style: EButtonMessageStyle.DANGER,
            },
          },
          {
            id: `menu_CONFIRM_APPROVE_${data.user_id}_${findUserClick.clan_nick || findUserClick.username}_${findSeller.clan_nick || findSeller.username}_${findSeller.userId}_${orderItem.name}_${orderItem.id}_${channelId}_${findSellerDMChannel?.channel_id || newDMChannel?.channel_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Approve`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ];

    // send embed to seller to confirm request
    const message = await this.client.sendDMChannelMessage(
      findSellerDMChannel?.channel_id || newDMChannel?.channel_id,
      '',
      { embed: embedSeller, components: componentsSeller },
    );
    const menuOrderMessage = new MenuOrderMessage();
    menuOrderMessage.clanId = '0';
    menuOrderMessage.channelId = message.channel_id;
    menuOrderMessage.author = orderItem.seller;
    menuOrderMessage.mode = EMessageMode.DM_MESSAGE;
    menuOrderMessage.isPublic = false;
    menuOrderMessage.createdAt = Date.now();
    menuOrderMessage.messageId = message.message_id;
    menuOrderMessage.type = TypeOrderMessage.CONFIRM;

    // save to edit message seller
    await this.menuOrderMessageRepository.save(menuOrderMessage);

    // send message to buyer
    const embedBuyer: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `ORDER REQUEST`,
        fields: [
          {
            name: `Sent your order request <${orderItem.name}> to <${findSeller.clan_nick || findSeller.username}> success! Please wait ${findSeller.clan_nick || findSeller.username}'s confirm!`,
            value: '',
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const messageToBuyer: ReplyMezonMessage = {
      userId: data.user_id,
      textContent: '',
      messOptions: { embed: embedBuyer },
    };
    this.messageQueue.addMessage(messageToBuyer);
  }

  async handleConfirmOrder(data) {
    const [
      _,
      __,
      typeButtonRes,
      buyerId,
      buyerName,
      sellerName,
      sellerId,
      itemName,
      itemId,
      channelId,
      channelDmId,
    ] = data.button_id.split('_');
    const isApprove = typeButtonRes === EmbebButtonType.APPROVE;
    const embedSeller: EmbedProps[] = [
      {
        color: isApprove ? '#57F287' : '#ED4245',
        title: `ORDER REQUEST ${isApprove ? 'APPROVED' : 'REJECTED'}`,
        fields: [
          {
            name: `[${isApprove ? 'APPROVED' : 'REJECTED'}] <${buyerName}> wants to order <${itemName}>. Please confirm the request!`,
            value: '',
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    await this.client.updateChatMessage(
      '0',
      channelDmId || data.channel_id,
      EMessageMode.DM_MESSAGE,
      false,
      data.message_id,
      { embed: embedSeller },
      [],
      [],
      true,
    );
    // send message to buyer
    const embedBuyer: EmbedProps[] = [
      {
        color: isApprove ? '#57F287' : '#ED4245',
        title: `ORDER ${isApprove ? 'APPROVED' : 'REJECTED'}`,
        fields: [
          {
            name: `[${isApprove ? 'APPROVED' : 'REJECTED'}] Your order request <${itemName}> is ${isApprove ? 'approved' : 'rejected'} by <${sellerName}>! Please contact with ${sellerName} for more information!`,
            value: '',
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const messageToBuyer: ReplyMezonMessage = {
      userId: buyerId,
      textContent: '',
      messOptions: { embed: embedBuyer },
    };
    this.messageQueue.addMessage(messageToBuyer);
    const invoiceOrder = new InvoiceOrder();
    invoiceOrder.itemId = itemId;
    invoiceOrder.buyer = buyerId;
    invoiceOrder.seller = sellerId;
    invoiceOrder.status = typeButtonRes;
    invoiceOrder.createdAt = Date.now();
    invoiceOrder.channelId = channelId;
    await this.invoiceOrderRepository.save(invoiceOrder);
  }
}
