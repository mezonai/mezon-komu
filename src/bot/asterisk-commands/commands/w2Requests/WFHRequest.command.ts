import {
  ChannelMessage,
  EButtonMessageStyle,
  EMessageComponentType,
  MezonClient,
} from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { User, W2Requests } from 'src/bot/models';
import { Repository } from 'typeorm';
import {
  EmbedProps,
  EMessageSelectType,
  EUserType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { EUserError } from 'src/bot/constants/error';
import { MezonClientService } from 'src/mezon/services/client.service';
import { getRandomColor } from 'src/bot/utils/helper';
import axios from 'axios';
@Command('wfhrequest')
export class wfhRequestCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientService: MezonClientService,
    @InjectRepository(W2Requests)
    private w2RequestsRepository: Repository<W2Requests>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent: string;
    let userQuery: string;
    const baseUrl = process.env.API_BASE_URL;
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
    const body = {
      keyword: 'wfhrequest',
      email: 'khanh.tranvan@ncc.asia', // will change later
    };
    let data;
    try {
      data = await axios.post(
        `${baseUrl}/list-property-definitions-by-command`,
        body,
        {
          headers: {
            'x-secret-key': process.env.X_SECRET_KEY,
          },
        },
      );
    } catch (error) {
      console.error('Error sending form data:', error);
    }

    function convertToObject(input) {
      if (Array.isArray(input)) {
        return input?.map(convertToObject);
      } else if (typeof input === 'object' && input !== null) {
        return Object.entries(input).reduce((acc, [key, value]) => {
          acc[key] = convertToObject(value);
          return acc;
        }, {});
      }
      return input;
    }

    function extractInputIds() {
      let ids = [];
      data?.data?.embed?.forEach((field) => {
        if (field.inputs?.id) {
          ids.push(field.inputs.id);
        }
      });
      return ids;
    }

    const result = convertToObject(data?.data?.embed);

    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `Form Request`,
        author: {
          name: findUser.username,
          icon_url: findUser.avatar,
          url: findUser.avatar,
        },
        fields: [...result?.map((item) => item)],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];

    const components = [
      {
        components: [
          {
            id: 'requestCANCEL',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: 'requestW2CONFIRM',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Confirm`,
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
    const dataInsert = new W2Requests();
    dataInsert.messageId = response.message_id;
    dataInsert.userId = message.sender_id;
    dataInsert.clanId = message.clan_id;
    dataInsert.channelId = message.channel_id;
    dataInsert.modeMessage = message.mode;
    dataInsert.isChannelPublic = message.is_public;
    dataInsert.createdAt = Date.now();
    dataInsert.workflowId = data?.data?.workflowDefinitionId;
    dataInsert.email = findUser.username;
    dataInsert.Id = extractInputIds();
    await this.w2RequestsRepository.save(dataInsert);
    return null;
  }
}
