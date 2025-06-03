import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  InvoiceOrder,
  MenuAddress,
  MenuOrder,
  MenuOrderMessage,
  User,
} from '../models';
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
import {
  EButtonMessageStyle,
  EMarkdownType,
  EMessageSelectType,
  MezonClient,
} from 'mezon-sdk';
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
    @InjectRepository(MenuAddress)
    private menuAddressRepository: Repository<MenuAddress>,
    private utilsService: UtilsService,
    private messageQueue: MessageQueue,
  ) {
    this.client = this.clientService.getClient();
  }

  async handelSelectMenuOrder(data) {
    try {
      const [
        _,
        typeButtonRes,
        authId,
        clanId,
        mode,
        isPublic,
        channelId,
        currentCorner,
        currentKeyMenu,
      ] = data.button_id.split('_');
      const dataParse = JSON.parse(data.extra_data || '{}');
      const itemId = dataParse?.MENU?.[0].split('_')?.[1];
      if (typeButtonRes === EmbebButtonType.ORDER) {
        await this.handleButtonOrder(data, itemId, channelId);
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
          data.user_id,
          currentCorner,
          currentKeyMenu,
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
          data.user_id,
          currentCorner,
          currentKeyMenu,
          true,
          orderItem.seller,
        );
      }
    } catch (error) {}
  }

  async handleEditOldReportMessage(channelId, clanId, findUserClick) {
    const findMessageOrderExist = await this.menuOrderMessageRepository.find({
      where: {
        channelId: channelId,
        clanId: clanId,
        isEdited: false,
        type: TypeOrderMessage.REPORT,
      },
    });
    const newMessageContent =
      '' +
      `A new report message has been created by <${findUserClick.clan_nick || findUserClick.username}> below!` +
      '';
    if (findMessageOrderExist.length > 0) {
      for (const {
        id,
        clanId,
        channelId,
        mode,
        isPublic,
        messageId,
      } of findMessageOrderExist) {
        const channel = await this.client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.update({
          t: newMessageContent,
          mk: [
            { type: EMarkdownType.PRE, s: 0, e: newMessageContent.length },
          ],
        });

        await this.menuOrderMessageRepository.update(
          { id },
          { isEdited: true },
        );
      }
    }
  }

  async handleReportOrder(
    clanId,
    channelId,
    isPublic,
    mode,
    userId,
    currentCorner,
    currentKeyMenu,
    isFinish?,
    sellerId?,
  ) {
    // check permission finish
    if (
      isFinish &&
      ![
        '1827994776956309504',
        '1805137029512564736', //anh.ngothuc
        '1800478701561843712', //vy.truongngoccam
        '1800396411926220800', //hien.ngothu
        '1820647107783036928', //ngan.tonthuy
        '1783441451758129152', //giang.tranminhchau
        '1840671876997713920', //ha.tranngan
      ].includes(userId)
    ) {
      const content =
        '' + `❌You have no permission to finish this menu!` + '';
      const messageToUser: ReplyMezonMessage = {
        userId: userId,
        textContent: content,
        messOptions: {
          mk: [{ type: 'pre', s: 0, e: content.length }],
        },
      };
      this.messageQueue.addMessage(messageToUser);
      return;
    }
    const findUserClick = await this.userRepository.findOne({
      where: { userId },
    });

    // edit old report message
    await this.handleEditOldReportMessage(channelId, clanId, findUserClick);

    const curerentMenu = await this.menuAddressRepository.findOne({
      where: {
        corner: currentCorner,
        key: currentKeyMenu,
      },
    });

    let messages = 'Không có ai order';
    let messagesFinish = 'Không có ai order';
    const arrayUser = await this.invoiceOrderRepository
      .createQueryBuilder('invoice')
      .select('buyer')
      .addSelect('MAX("createdAt")', 'timeStamp')
      .where(`"channelId" = :channelId`, { channelId })
      .andWhere(`"status" = :status`, { status: EmbebButtonType.CONFIRM })
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
      const messageArrayObj = await this.processInvoices(arrayUser);
      const messagesReportArray = messageArrayObj.messagesReportArray;
      const messagesReportSummaryArray =
        messageArrayObj.messagesReportSummaryArray;
      const totalQuantity = messageArrayObj.totalQuantity;
      const totalPrice = messageArrayObj.totalPrice;
      const text = isFinish
        ? `Chốt đơn!!! Tổng order lần này là ${listInvoice.length} người: \n\n`
        : `Danh sách order lần này hiện tại là ${listInvoice.length} người: \n\n`;
      messages =
        text + messagesReportArray.filter((msg) => msg !== null).join('\n');
      messagesFinish =
        'Chốt đơn!!! Số lượng order lần này như sau: \n\n' +
        messagesReportSummaryArray.filter((msg) => msg !== null).join('\n') +
        '\n\n' +
        `Quán: ${curerentMenu.name} ${curerentMenu.phone ? `- ${curerentMenu.phone}` : ''}${curerentMenu.link ? `\nLink quán: ${curerentMenu.link}` : ''}\n\nTổng số lượng: ${totalQuantity} món\n\nTổng tiền: ${totalPrice} vnđ`;
    }

    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `${isFinish ? 'Finish' : 'Report'} order by ${findUserClick.clan_nick || findUserClick.username}`,
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

    // save message report to edit when a new one created
    const response = await this.clientService.sendMessage(replyMessage);
    const menuOrderMessage = new MenuOrderMessage();
    menuOrderMessage.clanId = clanId;
    menuOrderMessage.channelId = channelId;
    menuOrderMessage.author = userId;
    menuOrderMessage.mode = mode;
    menuOrderMessage.isPublic = isPublic === 'true' ? true : false;
    menuOrderMessage.createdAt = Date.now();
    menuOrderMessage.messageId = response.message_id;
    menuOrderMessage.type = isFinish
      ? TypeOrderMessage.FINISH
      : TypeOrderMessage.REPORT;
    await this.menuOrderMessageRepository.save(menuOrderMessage);

    //handle finish order
    if (isFinish) {
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
          '' +
          'This menu has been closed, create another menu using *menu!' +
          '';
        for (const {
          id,
          clanId,
          channelId,
          mode,
          isPublic,
          messageId,
        } of findMessageOrderExist) {
          const channel = await this.client.channels.fetch(channelId);
          const message = await channel.messages.fetch(messageId);
          await message.update({
            t: newMessageContent,
            mk: [
              { type: EMarkdownType.PRE, s: 0, e: newMessageContent.length },
            ],
          });

          await this.menuOrderMessageRepository.update(
            { id },
            { isEdited: true },
          );
        }

        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `ORDER SUMMARY`,
            description: '```' + messagesFinish + '```',
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
        if (messagesFinish === 'Không có ai order') return;
        this.messageQueue.addMessage(replyMessage);
      }
    }
    if (
      isFinish &&
      ['1827994776956309504', sellerId].includes(findUserClick.userId)
    ) {
      await this.invoiceOrderRepository.update(
        { channelId, status: StatusInvoiceType.CONFIRM },
        { status: StatusInvoiceType.FINISH },
      );
    }
  }

  async handleButtonOrder(data, itemId, channelId) {
    try {
      const orderItem = await this.menuOrderRepository.findOne({
        where: { id: itemId },
      });
      const findSellerDMChannel = await this.channelDmMezonRepository.findOne({
        where: { user_id: data.user_id },
      });
      let newDMChannel;
      if (findSellerDMChannel) {
        newDMChannel = await this.clientService.createDMchannel(data.user_id);
      }
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          title: `CONFIRM ORDER REQUEST`,
          fields: [
            {
              name: `Order <${orderItem.name}>`,
              value: '',
            },
            {
              name: 'Note:',
              value: '',
              inputs: {
                id: `note`,
                type: EMessageComponentType.INPUT,
                component: {
                  placeholder: 'Input your note here',
                  type: EMessageSelectType.TEXT,
                  defaultValue: '',
                },
              },
            },
            {
              name: 'Số lượng:',
              value: '',
              inputs: {
                id: `quantity`,
                type: EMessageComponentType.INPUT,
                component: {
                  placeholder: 'Input your quantity here',
                  required: true,
                  defaultValue: 1,
                  type: 'number',
                },
              },
            },
          ],
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const components = [
        {
          components: [
            {
              id: `menu_CONFIRM_CANCEL_${data.user_id}_${orderItem.name}_${orderItem.id}_${channelId}_${findSellerDMChannel.channel_id || newDMChannel.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Cancel`,
                style: EButtonMessageStyle.DANGER,
              },
            },
            {
              id: `menu_CONFIRM_CONFIRM_${data.user_id}_${orderItem.name}_${orderItem.id}_${channelId}_${findSellerDMChannel.channel_id || newDMChannel.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Confirm`,
                style: EButtonMessageStyle.SUCCESS,
              },
            },
          ],
        },
      ];
      const messageToBuyer: ReplyMezonMessage = {
        userId: data.user_id,
        textContent: '',
        messOptions: { embed, components },
      };
      this.messageQueue.addMessage(messageToBuyer);
    } catch (error) {
      console.log('handleButtonOrder error', error);
    }
  }

  async handleConfirmOrder(data) {
    try {
      const [
        _,
        __,
        typeButtonRes,
        userId,
        itemName,
        itemId,
        channelId,
        channelDmId,
      ] = data.button_id.split('_');
      const extraData = JSON.parse(data?.extra_data || {});
      let isError = !(extraData?.quantity > 0) || extraData?.note?.length > 50;
      const isConfirmed = typeButtonRes === EmbebButtonType.CONFIRM;
      const itemNameOrder = extraData?.note
        ? `${itemName} (${extraData?.note.trim()})`
        : itemName;
      const embedSeller: EmbedProps[] = [
        {
          color: isConfirmed ? (isError ? '#ED4245' : '#57F287') : '#ED4245',
          title: isError
            ? `ORDER REQUEST REJECTED`
            : `ORDER REQUEST ${isConfirmed ? 'COMFIRMED' : 'CANCELED'}`,
          fields: [
            {
              name: isError
                ? `❌The quantity is invalid or note too long! Please order again!`
                : `${isConfirmed ? 'Confirm' : 'Cancel'} order <${itemNameOrder}> x${extraData?.quantity || 1} success!`,
              value: '',
            },
          ],
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const channel = await this.client.channels.fetch(channelId);
      const message = await channel.messages.fetch(data.message_id);
      await message.update({ embed: embedSeller });

      if (isError) return;
      const orderItem = await this.menuOrderRepository.findOne({
        where: { id: itemId },
      });
      const invoiceOrder = new InvoiceOrder();
      invoiceOrder.itemId = itemId;
      invoiceOrder.buyer = userId;
      invoiceOrder.seller = orderItem?.seller;
      invoiceOrder.status = typeButtonRes;
      invoiceOrder.createdAt = Date.now();
      invoiceOrder.channelId = channelId;
      invoiceOrder.quantity = extraData?.quantity || 1;
      invoiceOrder.note = extraData?.note?.trim() || '';
      await this.invoiceOrderRepository.save(invoiceOrder);
    } catch (error) {
      console.log('handleConfirmOrder error', error);
    }
  }

  async processInvoices(arrayUser) {
    const listInvoice = await this.invoiceOrderRepository
      .createQueryBuilder('invoice')
      .where('"createdAt" IN (:...time_stamps)', {
        time_stamps: arrayUser.map((item) => item.timeStamp),
      })
      .select('invoice.*')
      .execute();

    if (!listInvoice.length) return { messagesArray: [], result: [] };

    const itemIds = [...new Set(listInvoice.map((item) => item.itemId))];
    const buyerIds = [...new Set(listInvoice.map((item) => item.buyer))];

    const items = await this.menuOrderRepository.findBy({ id: In(itemIds) });
    const itemMap = new Map(
      items.map((item) => [
        item.id,
        { name: item.name, price: item.price || 0 },
      ]),
    );

    const buyers = await this.userRepository.findBy({ userId: In(buyerIds) });
    const buyerMap = new Map(
      buyers.map((buyer) => [buyer.userId, buyer.clan_nick || buyer.username]),
    );

    const messagesReportArray = listInvoice.map((list) => {
      const itemData = itemMap.get(+list.itemId) || {
        name: `Item ${list.itemId}`,
        price: 0,
      };
      const itemName = list?.note
        ? `${itemData.name} (${list.note.trim()})`
        : itemData.name;
      const buyerName = buyerMap.get(list.buyer) || `User ${list.buyer}`;

      return `<${buyerName}> order ${itemName.toUpperCase()} x${list.quantity || 1}`;
    });

    const itemCount = listInvoice.reduce((acc, item) => {
      const key = `${item.itemId}-${item?.note?.trim()?.toLowerCase() || 'no_note'}`;
      acc[key] = (acc[key] || 0) + item.quantity;
      return acc;
    }, {});

    const messagesReportSummaryArray = Object.entries(itemCount)
      .map(([key, quantity]) => {
        const [itemId, note] = key.split('-');
        const itemData = itemMap.get(+itemId) || {
          name: `Item ${itemId}`,
          price: 0,
        };

        return {
          name: itemData.name,
          note,
          quantity,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, note, quantity }) =>
        note === 'no_note'
          ? `- Số lượng <${name}>: ${quantity}`
          : `- Số lượng <${name} (${note})>: ${quantity}`,
      );
    let totalQuantity = 0;
    let totalPrice = 0;
    for (const item of listInvoice) {
      const price = itemMap.get(+item.itemId)?.price || 0;
      totalQuantity += item.quantity;
      totalPrice += item.quantity * price;
    }

    return {
      messagesReportArray,
      messagesReportSummaryArray,
      totalQuantity,
      totalPrice,
    };
  }
}
