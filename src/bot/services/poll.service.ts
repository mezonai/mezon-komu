import {
  ChannelType,
  EButtonMessageStyle,
  EMessageComponentType,
  MezonClient,
} from 'mezon-sdk';
import { ChannelMezon, MezonBotMessage, User } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EmbedProps,
  EMessageMode,
  MEZON_EMBED_FOOTER,
} from '../constants/configs';
import { ClientConfigService } from '../config/client-config.service';
import { MessageQueue } from './messageQueue.service';
import { Injectable } from '@nestjs/common';
import { ReactMessageChannel } from '../asterisk-commands/dto/replyMessage.dto';
import { MezonClientService } from 'src/mezon/services/client.service';
import { getRandomColor } from '../utils/helper';

@Injectable()
export class PollService {
  private client: MezonClient;
  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    @InjectRepository(User) private userRepository: Repository<User>,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
    private clientService: MezonClientService,
  ) {
    this.client = this.clientService.getClient();
  }

  private emojiIdDefault = {
    '1': '7249623295590321017',
    '2': '7249624251732854443',
    '3': '7249624274750507250',
    '4': '7249624293339259728',
    '5': '7249624315115336918',
    '6': '7249624334373657995',
    '7': '7249624356893400462',
    '8': '7249624383165932340',
    '9': '7249624408159143552',
    '10': '7249624441144979248',
    checked: '7237751213104827794',
  };

  private iconList = [
    '1️⃣ ',
    '2️⃣ ',
    '3️⃣ ',
    '4️⃣ ',
    '5️⃣ ',
    '6️⃣ ',
    '7️⃣ ',
    '8️⃣ ',
    '9️⃣ ',
    '🔟 ',
  ];

  getEmojiDefault() {
    return this.emojiIdDefault;
  }

  getOptionPoll(pollString: string) {
    let option;
    const regex = /\d️⃣:\s*(.*)/g;
    const options = [];
    while ((option = regex.exec(pollString)) !== null) {
      options.push(option[1].trim());
    }

    return options;
  }

  getPollTitle(pollString: string) {
    let pollTitle;
    const match = pollString.toString().match(/\[Poll\] - (.*)\n/);
    if (match && match[1]) {
      pollTitle = match[1];
    }

    return pollTitle;
  }

  generateEmbedComponents(options, data?) {
    const embedCompoents = options.map((option, index) => {
      const userVoted = data?.[index];
      return {
        label: `${this.iconList[index] + option.trim()} ${userVoted?.length ? `(${userVoted?.length})` : ''}`,
        value: `poll_${index}`,
        description: `${userVoted ? `- Voted: ${userVoted.join(', ')}` : `- (no one choose)`}`,
        style: EButtonMessageStyle.SUCCESS,
      };
    });
    return embedCompoents;
  }

  generateEmbedMessage(
    title: string,
    authorName: string,
    color: string,
    embedCompoents,
  ) {
    return [
      {
        color,
        title: `[Poll] - ${title}`,
        description:
          'Select option you want to vote.\nThe voting will end in 12 hours.\nPoll creater can end the poll forcefully by click Finish button.',
        fields: [
          {
            name: '',
            value: '',
            inputs: {
              id: `POLL`,
              type: EMessageComponentType.RADIO,
              component: embedCompoents,
            },
          },
          {
            name: `\nPoll created by ${authorName}\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`,
            value: '',
          },
        ],
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
  }

  generateEmbedComponentsResult(options, data, authorName: string) {
    const embedCompoents = options.map((option, index) => {
      const userVoted = data?.[index];
      return {
        name: `${this.iconList[index] + option.trim()} (${userVoted?.length || 0})`,
        value: `${userVoted ? `- Voted: ${userVoted.join(', ')}` : `- (no one choose)`}`,
      };
    });
    authorName &&
      embedCompoents.push({
        name: `\nPoll created by ${authorName}\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`,
        value: '',
      });
    return embedCompoents;
  }

  generateEmbedMessageResult(title: string, color: string, embedCompoents) {
    return [
      {
        color,
        title: `[Poll result] - ${title}`,
        description: "Ding! Ding! Ding!\nTime's up! Results are\n",
        fields: embedCompoents,
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
  }

  generateButtonComponents(data) {
    return [
      {
        components: [
          {
            id: `poll_CANCEL_${data.sender_id}_${data.clan_id}_${data.mode}_${data.is_public}_${data?.color}_${data.clan_nick || data.username}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `poll_VOTE_${data.sender_id}_${data.clan_id}_${data.mode}_${data.is_public}_${data?.color}_${data.clan_nick || data.username}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Vote`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
          {
            id: `poll_FINISH_${data.sender_id}_${data.clan_id}_${data.mode}_${data.is_public}_${data?.color}_${data.clan_nick || data.username}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Finish`,
              style: EButtonMessageStyle.DANGER,
            },
          },
        ],
      },
    ];
  }

  // TODO: split text
  // splitMessageByNewLines(message, maxNewLinesPerChunk = 100) {
  //   const lines = message.split('\n');
  //   const chunks = [];
  //   for (let i = 0; i < lines.length; i += maxNewLinesPerChunk) {
  //     chunks.push(lines.slice(i, i + maxNewLinesPerChunk).join('\n'));
  //   }
  //   return chunks;
  // };

  async handleResultPoll(findMessagePoll: MezonBotMessage) {
    try {
      let userReactMessageId =
        findMessagePoll.pollResult?.map((item) => JSON.parse(item)) || [];
      const content = findMessagePoll.content.split('_');
      const [title, ...options] = content;

      const findUser = await this.userRepository.findOne({
        where: { userId: findMessagePoll.userId },
      });

      const groupedByValue: { [key: string]: any[] } =
        userReactMessageId.reduce((acc: any, item) => {
          const { value } = item;
          if (!acc[value]) {
            acc[value] = [];
          }
          acc[value].push(item.username);
          return acc;
        }, {});
      const embedCompoents = this.generateEmbedComponentsResult(
        options,
        groupedByValue,
        findUser?.clan_nick || findUser?.username,
      );
      const embed: EmbedProps[] = this.generateEmbedMessageResult(
        title,
        getRandomColor(),
        embedCompoents,
      );

      await this.mezonBotMessageRepository.update(
        {
          id: findMessagePoll.id,
        },
        { deleted: true },
      );

      const findChannel = await this.channelRepository.findOne({
        where: {
          channel_id: findMessagePoll.channelId,
          clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
        },
      });
      const isThread =
        findChannel?.channel_type === ChannelType.CHANNEL_TYPE_THREAD ||
        (findChannel?.parrent_id !== '0' && findChannel?.parrent_id !== '');
      const replyMessage = {
        clan_id: this.clientConfig.clandNccId,
        channel_id: findMessagePoll.channelId,
        is_public: findChannel ? !findChannel?.channel_private : false,
        is_parent_public: findChannel ? findChannel?.is_parent_public : true,
        parent_id: '0',
        mode: isThread
          ? EMessageMode.THREAD_MESSAGE
          : EMessageMode.CHANNEL_MESSAGE,
        msg: {
          embed,
        },
      };
      this.messageQueue.addMessage(replyMessage);
      const textConfirm = '```This poll has finished!```';
      const msgFinish = {
        t: textConfirm,
        mk: [{ type: 't', s: 0, e: textConfirm.length }],
      };
      await this.client.updateChatMessage(
        this.clientConfig.clandNccId,
        findMessagePoll.channelId,
        isThread ? EMessageMode.THREAD_MESSAGE : EMessageMode.CHANNEL_MESSAGE,
        findChannel ? !findChannel?.channel_private : false,
        findMessagePoll.messageId,
        msgFinish,
        [],
        [],
        true,
      );
    } catch (error) {
      console.log('handleResultPoll', error);
    }
  }

  async handelReactPollMessage(message, messageSent) {
    if (message.msg.t?.startsWith('```[Poll]') && messageSent.message_id) {
      const dataMezonBotMessage = {
        messageId: messageSent.message_id,
        userId: message.sender_id,
        channelId: message.channel_id,
        content: message.msg.t + '',
        createAt: Date.now(),
        pollResult: [],
      };
      await this.mezonBotMessageRepository.insert(dataMezonBotMessage);
      const options = this.getOptionPoll(message.msg.t);
      options.push('checked');
      options.forEach(async (option, index) => {
        const listEmoji = this.getEmojiDefault();
        const dataReact: ReactMessageChannel = {
          clan_id: message.clan_id,
          channel_id: message.channel_id,
          is_public: message.is_public,
          is_parent_public: message.is_parent_public,
          message_id: messageSent.message_id,
          emoji_id:
            option === 'checked'
              ? listEmoji[option]
              : listEmoji[index + 1 + ''],
          emoji: option === 'checked' ? option : index + '',
          count: 1,
          mode: message.mode,
          message_sender_id: process.env.BOT_KOMU_ID,
        };
        await this.clientService.reactMessageChannel(dataReact);
      });
    }
  }
}
