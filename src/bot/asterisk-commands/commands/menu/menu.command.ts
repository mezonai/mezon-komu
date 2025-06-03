import {
  ChannelMessage,
  EButtonMessageStyle,
  EMarkdownType,
  EMessageComponentType,
  MezonClient,
} from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';
import { InjectRepository } from '@nestjs/typeorm';
import { MenuAddress, MenuOrder, MenuOrderMessage } from 'src/bot/models';
import { Like, Repository } from 'typeorm';
import {
  EmbedProps,
  MEZON_EMBED_FOOTER,
  TypeOrderMessage,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { MezonClientService } from 'src/mezon/services/client.service';

// @Command('menu')
export class MenuCommand extends CommandMessage {
  private client: MezonClient;
  private validCorner = new Map([
    [['vinh', 'v'], 'vinh'],
    [['hn1', 'hanoi1', 'h1'], 'hanoi1'],
    [['hn2', 'hanoi2', 'h2'], 'hanoi2'],
    [['hn3', 'hanoi3', 'h3'], 'hanoi3'],
    [['dn', 'd', 'danang'], 'danang'],
    [['qn', 'quynhon', 'q'], 'quynhon'],
    [['sg', 'saigon', 's'], 'saigon'],
  ]);
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(MenuOrder)
    private menuRepository: Repository<MenuOrder>,
    @InjectRepository(MenuAddress)
    private menuAddressRepository: Repository<MenuAddress>,
    @InjectRepository(MenuOrderMessage)
    private menuOrderMessageRepository: Repository<MenuOrderMessage>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  private defaultMenuCorner = {
    vinh: 'mambo',
    hanoi1: 'tra-sukem',
    hanoi2: 'ngocthach',
    hanoi3: 'mocquan',
    danang: 'tuctac',
    quynhon: 'chutcoffee',
    saigon: 'nangcoffee',
  };

  getCorrectName(text: string): string | null {
    if (!text) return null;
    text = text.toLowerCase();
    for (const [keys, value] of this.validCorner) {
      if (keys.includes(text)) {
        return value;
      }
    }
    return null;
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent =
      '' +
      '- Command: *menu corner (address)\n- In case no address: *menu corner -> using default address!\n- *menu corner list //To check corner list address or default address' +
      +'';
    const currentCorner = this.getCorrectName(args[0]);
    if (args[0]) {
      if (!currentCorner) {
        messageContent = '' + 'Not found this corner!' + '';

        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 'pre', s: 0, e: messageContent.length }],
          },
          message,
        );
      }

      if (args[1] === 'list') {
        const listMenuByCorner = await this.menuAddressRepository.find({
          where: {
            corner: currentCorner,
          },
        });
        const messageList = listMenuByCorner.map((item, index) => {
          return {
            name: `${index + 1}. ${item.name} ${item.address ? ` - ${item.address}` : ''} ${item.phone ? ` - ${item.phone}` : ''}`,
            value: `*menu ${currentCorner} ${item.key} -> to use this menu!`,
          };
        });
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `MENU LIST ${currentCorner.toUpperCase()} - `,
            description: "Let's order!!!",
            fields: messageList,
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        messageContent = '' + messageList.join('\n') + '';
        return this.replyMessageGenerate(
          {
            embed,
          },
          message,
        );
      }
      const findMessageOrderExist = await this.menuOrderMessageRepository.find({
        where: {
          channelId: message.channel_id,
          clanId: message.clan_id,
          isEdited: false,
          type: TypeOrderMessage.CREATE,
        },
      });

      if (args[1]) {
        if (
          findMessageOrderExist.length > 0 &&
          this.defaultMenuCorner[currentCorner] !== args[1]
        ) {
          messageContent =
            '' +
            `Ordering menu <${this.defaultMenuCorner[currentCorner]}>. Please finish this menu if you want to change to another menu!` +
            '';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 'pre', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        this.defaultMenuCorner[currentCorner] = args[1];
      }

      const newMessageContent =
        '' +
        'A new menu has been created below, please order from that menu!' +
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

      const menuList = await this.menuRepository.find({
        where: {
          corner: currentCorner,
          addressKey: args[1] || this.defaultMenuCorner[currentCorner],
        },
      });

      if (!menuList.length) {
        messageContent = 'Menu not found!';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 'pre', s: 0, e: messageContent.length }],
          },
          message,
        );
      }

      const mappedMenu = menuList.reduce((acc, item) => {
        const categoryIndex = acc.findIndex(
          (obj) => obj.category === item.category,
        );

        if (categoryIndex !== -1) {
          acc[categoryIndex].menuList.push(item);
        } else {
          acc.push({
            category: item.category,
            menuList: [item],
          });
        }

        return acc;
      }, []);
      const formattedMenu = mappedMenu.map((categoryObj) => {
        return [
          {
            name: ``,
            value: '\n.',
          },
          {
            name: `${categoryObj.category}`,
            value: '',
          },
          {
            name: '',
            value: '',
            inputs: {
              id: `MENU`,
              type: EMessageComponentType.RADIO,
              component: categoryObj.menuList.map((menu) => ({
                label: '',
                value: `order_${menu?.id}`,
                description: `${menu?.name} - ${menu?.price}đ`,
                style: EButtonMessageStyle.SUCCESS,
              })),
            },
          },
        ];
      });
      const combinedMenu = formattedMenu.flat();
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          title: `MENU LIST ${currentCorner.toUpperCase()}`,
          description: "Let's order!!!",
          fields: [
            ...combinedMenu,
            {
              name: `\nEnjoy your meal!!!\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`,
              value: '',
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
              id: `menu_FINISH_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}_${currentCorner}_${args[1] || this.defaultMenuCorner[currentCorner]}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Finish`,
                style: EButtonMessageStyle.DANGER,
              },
            },
            {
              id: `menu_REPORT_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}_${currentCorner}_${args[1] || this.defaultMenuCorner[currentCorner]}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Report`,
                style: EButtonMessageStyle.PRIMARY,
              },
            },
            {
              id: `menu_ORDER_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Order`,
                style: EButtonMessageStyle.SUCCESS,
              },
            },
          ],
        },
      ];

      const dataSend = this.replyMessageGenerate(
        {
          embed,
          components,
        },
        message,
      );
      const response = await this.clientService.sendMessage(dataSend);
      const menuOrderMessage = new MenuOrderMessage();
      menuOrderMessage.clanId = message.clan_id;
      menuOrderMessage.channelId = message.channel_id;
      menuOrderMessage.author = message.sender_id;
      menuOrderMessage.mode = message.mode;
      menuOrderMessage.isPublic = message.is_public;
      menuOrderMessage.createdAt = Date.now();
      menuOrderMessage.messageId = response.message_id;
      menuOrderMessage.type = TypeOrderMessage.CREATE;
      await this.menuOrderMessageRepository.save(menuOrderMessage);
      return null;
    }
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 'pre', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
