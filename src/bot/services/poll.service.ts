import {
  EButtonMessageStyle,
  EMarkdownType,
  EMessageComponentType,
  MezonClient,
} from 'mezon-sdk';

import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { User } from 'src/bot/models/user.entity';
import {
  EmbebButtonType,
  EmbedProps,
  MEZON_EMBED_FOOTER,
  PollType,
} from 'src/bot/constants/configs';
import { MezonBotMessage } from 'src/bot/models/mezonBotMessage.entity';
import { MessageButtonClicked } from 'mezon-sdk/dist/cjs/rtapi/realtime';
import { MezonClientService } from 'src/mezon/services/client.service';
import { getRandomColor, sleep } from '../utils/helper';
import { PollTrackerService } from './PollTracker.services';

@Injectable()
export class PollService {
  private client: MezonClient;
  private blockEditedList: string[] = [];
  private POLL_TOTAL_LIMIT = 3500;
  constructor(
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    @InjectRepository(User) private userRepository: Repository<User>,
    private clientService: MezonClientService,
    private pollTrackerService: PollTrackerService,
  ) {
    this.client = this.clientService.getClient();
  }

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

  private formatVotedUsers(users: string[] | undefined, maxChars: number) {
    if (!users || users.length === 0) return '(no one choose)';
    if (maxChars <= 0) return '...';

    const result: string[] = [];
    let currentLen = 0;

    for (const name of users) {
      const piece = (result.length ? ', ' : '') + name;
      if (currentLen + piece.length > maxChars) break;
      result.push(name);
      currentLen += piece.length;
    }

    const hiddenCount = users.length - result.length;
    if (hiddenCount > 0) {
      return `${result.join(', ')} ... (+${hiddenCount} more people)`;
    }

    return result.join(', ');
  }

  generateEmbedComponents(options, data?, isMultiple?, dataUser?) {
    const optionCount = Math.min(Math.max(options.length, 2), 10);

    const availableForOptions = Math.max(1000, this.POLL_TOTAL_LIMIT);

    const maxCharsPerOption = Math.floor(availableForOptions / optionCount);

    const embedComponents = options.map((option, index) => {
      const userVoted = data?.[index] || [];
      const idVoted = dataUser?.[index];

      const voteCount = userVoted.length;
      const labelCount = voteCount ? ` (${voteCount})` : '';

      const prefix = userVoted.length ? '- Voted: ' : '- (no one choose)';
      const maxUserChars = maxCharsPerOption - prefix.length;

      const description = userVoted.length
        ? `${prefix}${this.formatVotedUsers(userVoted, maxUserChars)}`
        : prefix;

      return {
        ...(isMultiple ? { name: `poll_${index}` } : {}),
        label: `${this.iconList[index]}${option.trim()}${labelCount}`,
        value: `poll_${index}`,
        description,
        style: EButtonMessageStyle.SUCCESS,
        extraData: idVoted,
      };
    });

    return embedComponents;
  }

  generateEmbedMessageVote(
    title: string,
    authorName: string,
    color: string,
    embedCompoents,
    time,
    isMultiple?,
  ) {
    return [
      {
        color,
        title: `[Poll] - ${title}`,
        description: `Select option you want to vote.\nThe voting will end in ${time ? `${time} hours` : '7 days'} .\nPoll creater can end the poll forcefully by click Finish button.`,
        fields: [
          {
            name: '',
            value: '',
            inputs: {
              id: `POLL`,
              type: EMessageComponentType.RADIO,
              component: embedCompoents,
              ...(isMultiple ? { max_options: embedCompoents.length } : {}),
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
    const availableForOptions = Math.max(1000, this.POLL_TOTAL_LIMIT);

    const optionCount = Math.min(Math.max(options.length, 2), 10);
    const maxCharsPerOption = Math.floor(availableForOptions / optionCount);

    const embedComponents = options.map((option, index) => {
      const userVoted: string[] = data?.[index] || [];
      const voteCount = userVoted.length;

      const prefix = voteCount ? '- Voted: ' : '- (no one choose)';
      const maxUserChars = Math.max(0, maxCharsPerOption - prefix.length);

      const value = voteCount
        ? `${prefix}${this.formatVotedUsers(userVoted, maxUserChars)}`
        : prefix;

      return {
        name: `${this.iconList?.[index] ?? ''}${option.trim()} (${voteCount})`,
        value,
      };
    });

    if (authorName) {
      embedComponents.push({
        name: `\nPoll created by ${authorName}`,
        value: '',
      });
    }

    return embedComponents;
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

  generateButtonComponentsVote(data) {
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
      let userVoteMessageId =
        findMessagePoll.pollResult?.map((item) => JSON.parse(item)) || [];
      const content = findMessagePoll.content.split('_');
      const [title, type, ...options] = content;

      const findUser = await this.userRepository.findOne({
        where: { userId: findMessagePoll.userId },
      });
      let groupedByValue: { [key: string]: string[] } = {};

      const isMultiple = type === PollType.MULTIPLE;
      if (isMultiple) {
        for (const user of userVoteMessageId) {
          for (const val of user.values) {
            if (!groupedByValue[val]) {
              groupedByValue[val] = [];
            }
            groupedByValue[val].push(user.username);
          }
        }
      } else {
        for (const item of userVoteMessageId) {
          if (!groupedByValue[item.value]) {
            groupedByValue[item.value] = [];
          }
          groupedByValue[item.value].push(item.username);
        }
      }

      const embedCompoents = this.generateEmbedComponentsResult(
        options,
        groupedByValue,
        findUser?.clan_nick || findUser?.username!,
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
      const findChannel = await this.client.channels.fetch(
        findMessagePoll.channelId,
      );
      await findChannel.send({
        embed,
      });
      const textConfirm = 'This poll has finished!';
      const msgFinish = {
        t: textConfirm,
        mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
      };
      const channel = await this.client.channels.fetch(
        findMessagePoll.channelId,
      );
      if (!channel) return;
      const pollMessage = await channel.messages.fetch(
        findMessagePoll.messageId,
      );
      if (!pollMessage) return;
      await pollMessage.update(msgFinish);
    } catch (error) {
      console.log('handleResultPoll', error);
    }
  }

  generateFieldsCreatePoll(
    optionCount: number,
    defaultValues?: string[],
    isMultiple?: boolean,
    timeLeftDisplay?: number,
  ) {
    const titleField = {
      name: 'Title',
      value: '',
      inputs: {
        id: 'title',
        type: EMessageComponentType.INPUT,
        component: {
          id: 'title',
          placeholder: 'Input title here',
          defaultValue: '',
        },
      },
    };
    const expiredField = {
      name: 'Expired Time (hour) - Default: 168 hours (7 days)',
      value: '',
      inputs: {
        id: 'expired',
        type: EMessageComponentType.INPUT,
        component: {
          id: 'expired',
          placeholder: 'Input expired time here',
          defaultValue: timeLeftDisplay ?? 168,
          type: 'number',
        },
      },
    };

    const pollType = {
      name: 'Type',
      value: '',
      inputs: {
        id: `type`,
        type: EMessageComponentType.SELECT,
        component: {
          id: `type`,
          options: [
            { label: 'Single choice', value: 'SINGLE' },
            { label: 'Multiple choice', value: 'MULTIPLE' },
          ],
          valueSelected: isMultiple
            ? { label: 'Multiple choice', value: 'MULTIPLE' }
            : { label: 'Single choice', value: 'SINGLE' },
        },
      },
    };

    const optionFields = Array.from({ length: optionCount }, (_, index) => {
      const idx = index + 1;
      return {
        name: `Option ${this.iconList[index]}`,
        value: '',
        inputs: {
          id: `option_${idx}`,
          type: EMessageComponentType.INPUT,
          component: {
            id: `option_${idx}`,
            placeholder: `Input option ${idx} here`,
            defaultValue: defaultValues?.[index] ?? '',
          },
        },
      };
    });

    return [titleField, ...optionFields, pollType, expiredField];
  }

  generateComponentsCreatePoll(
    currentOptionsLength: number,
    color: string,
    authorName: string,
    clanId: string,
    authorId,
  ) {
    return [
      {
        components: [
          {
            id: `pollCreate_CANCEL_${currentOptionsLength}_${color}_${authorName}_${clanId}_${authorId}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `pollCreate_ADD_${currentOptionsLength}_${color}_${authorName}_${clanId}_${authorId}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Add Option`,
              style: EButtonMessageStyle.PRIMARY,
            },
          },
          {
            id: `pollCreate_CREATE_${currentOptionsLength}_${color}_${authorName}_${clanId}_${authorId}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Create`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ];
  }

  async handleCreatePoll(data: MessageButtonClicked) {
    const messsageId = data.message_id;
    const channel = await this.client.channels.fetch(data.channel_id);
    const message = await channel.messages.fetch(messsageId);
    const [
      _,
      typeButtonRes,
      currentOptionsLength,
      color,
      authorName,
      clanId,
      authId,
    ] = data.button_id.split('_');

    if (data.user_id !== authId) {
      const user = await this.client.users.fetch(data.user_id);
      const content = `❌You have no permission to edit this poll created by ${authorName}!`;
      return await user.sendDM({
        t: content,
        mk: [{ type: EMarkdownType.PRE, s: 0, e: content.length }],
      });
    }
    const extraDataObj = JSON.parse(data.extra_data || '{}');
    const totalOptions = +currentOptionsLength + 1;

    const optionValues = Array.from(
      { length: +currentOptionsLength },
      (_, i) => {
        const key = `option_${i + 1}`;
        const val = extraDataObj?.[key];
        return typeof val === 'string' ? val : '';
      },
    );
    const time = extraDataObj?.expired ? +extraDataObj?.expired : 168;
    const timeLeftRounded = Math.round(time * 100) / 100;
    const timeLeftDisplay = Number.isInteger(timeLeftRounded)
      ? timeLeftRounded
      : parseFloat(timeLeftRounded.toFixed(2));

    const isMultiple = extraDataObj?.type === PollType.MULTIPLE;

    if (typeButtonRes === EmbebButtonType.ADD) {
      if (+currentOptionsLength > 9) {
        const textConfirm = 'There are too many options, limit is 10!';
        const msgCancel = {
          t: textConfirm,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
        };
        await message.reply(msgCancel);
        return;
      }

      const embed: EmbedProps[] = [
        {
          color,
          title: `Poll Configuration`,
          fields: this.generateFieldsCreatePoll(
            totalOptions,
            optionValues,
            isMultiple,
            timeLeftDisplay,
          ),
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const components = this.generateComponentsCreatePoll(
        totalOptions,
        color,
        authorName,
        clanId,
        authId,
      );
      await message.update({ embed, components });
      return;
    }

    if (typeButtonRes === EmbebButtonType.CANCEL) {
      const textConfirm = 'Cancel create poll successful!';
      const msgCancel = {
        t: textConfirm,
        mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
      };
      await message.update(msgCancel);
      return;
    }

    if (typeButtonRes === EmbebButtonType.CREATE) {
      if (timeLeftDisplay < 0.5) {
        const textConfirm = 'Expired Time is not valid, min 0.5 hour!';
        const msgCancel = {
          t: textConfirm,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
        };
        await message.reply(msgCancel);
        return;
      }
      const title = extraDataObj?.title;
      if (!title) {
        const textConfirm = 'Missing title for this poll. Please add it!';
        const msgCancel = {
          t: textConfirm,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
        };
        await message.reply(msgCancel);
        return;
      }
      const colorEmbed = getRandomColor();
      const optionsPoll = optionValues.filter((val) => val !== '');
      if (optionsPoll.length < 2) {
        const textConfirm =
          'Not enough valid options. At least 2 options are required. Please check again!';
        const msgCancel = {
          t: textConfirm,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
        };
        await message.reply(msgCancel);
        return;
      }
      const embedCompoents = this.generateEmbedComponents(
        optionsPoll,
        null,
        isMultiple,
      );

      const embed: EmbedProps[] = this.generateEmbedMessageVote(
        title,
        authorName,
        colorEmbed,
        embedCompoents,
        timeLeftDisplay === 168 ? null : timeLeftDisplay,
        isMultiple,
      );

      const dataVote = {
        sender_id: authId,
        mode: (channel?.channel_type ?? 1) + 1,
        is_public: !channel.is_private,
        color,
        clan_nick: authorName,
        clan_id: clanId
      };
      const components = this.generateButtonComponentsVote({
        ...dataVote,
        color: colorEmbed,
        isMultiple,
      });

      const pollMessageSent = await message?.update({
        embed,
        components,
      });
      if (!pollMessageSent) return;
      const dataMezonBotMessage = {
        messageId: pollMessageSent.message_id,
        userId: authId,
        clanId: clanId,
        isChannelPublic: !channel.is_private,
        modeMessage: (channel?.channel_type ?? 1) + 1,
        channelId: data.channel_id,
        content: title + '_' + extraDataObj?.type + '_' + optionsPoll.join('_'),
        createAt: Date.now(),
        expireAt:
          Date.now() +
          (time ? +time * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000),
        pollResult: [],
      };
      await this.mezonBotMessageRepository.insert(dataMezonBotMessage);
      return;
    }
  }

  async handleSelectPoll(data: MessageButtonClicked) {
    try {
      if (
        this.blockEditedList.includes(`${data.message_id}-${data.channel_id}`)
      )
        return;
      const [
        _,
        typeButtonRes,
        authId,
        clanId,
        mode,
        isPublic,
        color,
        authorName,
      ] = data.button_id.split('_');
      const channel = await this.client.channels.fetch(data.channel_id);
      const user = await this.client.users.fetch(data.user_id);
      const messsage = await channel.messages.fetch(data.message_id);

      const isPublicBoolean = isPublic === 'true' ? true : false;
      const findMessagePoll = await this.mezonBotMessageRepository.findOne({
        where: {
          messageId: data.message_id,
          channelId: data.channel_id,
          deleted: false,
        },
      });
      if (!findMessagePoll) return;
      let userVoteMessageId =
        findMessagePoll.pollResult?.map((item) => JSON.parse(item)) || [];

      const content = findMessagePoll.content.split('_');
      const [title, type, ...options] = content;

      const isMultiple = type === PollType.MULTIPLE;

      const dataParse = JSON.parse(data.extra_data || '{}');
      let value = isMultiple
        ? dataParse?.POLL?.map((pollId: string) => pollId.split('_')?.[1])
        : dataParse?.POLL?.split('_')?.[1];

      if (typeButtonRes === EmbebButtonType.CANCEL) {
        if (data.user_id !== authId) {
          const content = `[Poll] - ${title}\n❌You have no permission to cancel this poll!`;
          return await user.sendDM({
            t: content,
            mk: [{ type: EMarkdownType.PRE, s: 0, e: content.length }],
          });
        }
        const textCancel = 'Cancel poll successful!';
        const msgCancel = {
          t: textCancel,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textCancel.length }],
        };
        await this.mezonBotMessageRepository.update(
          {
            id: findMessagePoll.id,
          },
          { deleted: true },
        );
        await messsage.update(msgCancel);
      }
      if (typeButtonRes === EmbebButtonType.VOTE) {
        const findUser = await this.userRepository.findOne({
          where: { userId: data.user_id },
        });
        if (!findUser) return;

        const username = findUser.clan_nick || findUser.username;
        const id = findUser.userId;

        if (!username || !value) return;

        let groupedByValue: { [key: string]: string[] } = {};
        let groupedById: { [key: string]: string[] } = {};

        if (!isMultiple) {
          // === SINGLE mode ===
          const newUserVoteMessage = { id, username, value };

          const exists = userVoteMessageId.some(
            (item) =>
              item.username === newUserVoteMessage.username &&
              item.value === newUserVoteMessage.value,
          );
          if (exists) return;

          let checkExist = false;
          userVoteMessageId = userVoteMessageId.map((user) => {
            if (user.username === username) {
              checkExist = true;
              return { ...user, value };
            }
            return user;
          });
          if (!checkExist) {
            userVoteMessageId.push(newUserVoteMessage);
          }

          // Group username by value (SINGLE)
          for (const item of userVoteMessageId) {
            if (!groupedByValue[item.value]) {
              groupedByValue[item.value] = [];
            }
            groupedByValue[item.value].push(item.username);
          }

          for (const item of userVoteMessageId) {
            if (!groupedById[item.value]) {
              groupedById[item.value] = [];
            }
            groupedById[item.value].push(item.id);
          }
        } else {
          // === MULTIPLE mode ===

          const values: string[] = value;
          if (!values.length) return;

          let checkExist = false;
          userVoteMessageId = userVoteMessageId.map((user) => {
            if (user.username === username) {
              checkExist = true;
              return { ...user, values };
            }
            return user;
          });
          if (!checkExist) {
            userVoteMessageId.push({ username, values, id });
          }

          // Group username by value (MULTIPLE)
          for (const user of userVoteMessageId) {
            for (const val of user.values) {
              if (!groupedByValue[val]) {
                groupedByValue[val] = [];
              }
              groupedByValue[val].push(user.username);
            }
          }
          for (const user of userVoteMessageId) {
            for (const val of user.values) {
              if (!groupedById[val]) {
                groupedById[val] = [];
              }
              groupedById[val].push(user.id);
            }
          }
        }

        // display user + value on embed
        const embedCompoents = this.generateEmbedComponents(
          options,
          groupedByValue,
          isMultiple,
          groupedById,
        );

        const create = findMessagePoll.createAt;
        const timeLeftInMs = findMessagePoll.expireAt - create;
        const timeLeftInHoursRaw = timeLeftInMs / (60 * 60 * 1000);

        const timeLeftRounded = Math.round(timeLeftInHoursRaw * 100) / 100;

        const timeLeftDisplay = Number.isInteger(timeLeftRounded)
          ? timeLeftRounded
          : parseFloat(timeLeftRounded.toFixed(2));
        // embed poll
        const embed: EmbedProps[] = this.generateEmbedMessageVote(
          title,
          authorName,
          color,
          embedCompoents,
          timeLeftDisplay === 168 ? null : timeLeftDisplay,
          isMultiple,
        );
        const dataGenerateButtonComponents = {
          sender_id: authId,
          clan_id: clanId,
          mode,
          is_public: isPublicBoolean,
          color,
          username: authorName,
          isMultiple,
        };

        // button embed poll
        const components = this.generateButtonComponentsVote(
          dataGenerateButtonComponents,
        );

        // update voted into db
        await this.mezonBotMessageRepository.update(
          {
            messageId: findMessagePoll.messageId,
            channelId: findMessagePoll.channelId,
          },
          { pollResult: userVoteMessageId },
        );

        const state = this.pollTrackerService.getPollState(
          findMessagePoll.messageId,
        );

        const isExpired = state?.expired;

        // update message
        const channel = await this.client.channels.fetch(
          findMessagePoll.channelId,
        );
        if (!isExpired && typeof isExpired !== 'undefined') {
          await messsage.update({ embed, components });
        } else {
          await messsage.delete();
          this.pollTrackerService.stopTrackPoll(findMessagePoll.messageId)
          const newpollMessage = await channel.send({ embed, components });
          this.pollTrackerService.startTrackPoll(clanId, findMessagePoll.channelId, newpollMessage.message_id);
          await this.mezonBotMessageRepository.update(
            { id: findMessagePoll.id },
            { messageId: newpollMessage.message_id },
          );
        }
      }

      if (typeButtonRes === EmbebButtonType.FINISH) {
        if (data.user_id !== authId) {
          const content = `[Poll] - ${title}\n❌You have no permission to finish this poll!`;
          return await user.sendDM({
            t: content,
            mk: [{ type: EMarkdownType.PRE, s: 0, e: content.length }],
          });
        }
        this.blockEditedList.push(`${data.message_id}-${data.channel_id}`);
        await sleep(700);
        await this.handleResultPoll(findMessagePoll);
      }
    } catch (error) {
      console.log('handleSelectPoll', error);
    }
  }
}
