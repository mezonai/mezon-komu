/* eslint-disable prettier/prettier */
import { ChannelMessage } from 'mezon-sdk';
import { EButtonMessageStyle, EMessageComponentType } from 'mezon-sdk';
import { CommandMessage } from '../../abstracts/command.abstract';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Daily, User } from 'src/bot/models';
import { dailyHelp } from './daily.constants';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { TimeSheetService } from 'src/bot/services/timesheet.services';
import { extractText, getRandomColor } from 'src/bot/utils/helper';
import { EmbedProps } from 'src/bot/constants/configs';

export enum EMessageSelectType {
  TEXT = 1,
  USER = 2,
  ROLE = 3,
  CHANNEL = 4,
}
@Command('daily')
export class DailyCommand extends CommandMessage {
  constructor(
    private timeSheetService: TimeSheetService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Daily) private dailyRepository: Repository<Daily>,
  ) {
    super();
  }

  validateMessage(args: string[]) {
    if (args[0] === 'help') return dailyHelp;
    const daily = args.join(' ');
    let checkDaily = false;
    const wordInString = (s, word) =>
      new RegExp('\\b' + word + '\\b', 'i').test(s);
    ['yesterday', 'today', 'block'].forEach((q) => {
      if (!wordInString(daily, q)) return (checkDaily = true);
    });

    if (checkDaily) return dailyHelp;

    if (!daily || daily == undefined) {
      return '```please add your daily text```';
    }

    return false;
  }

  async execute(args: string[], message: ChannelMessage) {
    const content = message.content.t;
    const messageid = message.message_id;
    const messageValidate = this.validateMessage(args);

    const clanId = message.clan_id;
    const codeMess = message.code;
    const modeMess = message.mode;
    const isPublic = message.is_public;
    const ownerSenderDaily = message.sender_id
    const onlyDailySyntax =
      message?.content?.t && typeof message.content.t === 'string'
        ? message.content.t.trim() === '*daily'
        : false;
    if (messageValidate && !onlyDailySyntax)
      return this.replyMessageGenerate(
        {
          messageContent: messageValidate,
          mk: [{ type: 't', s: 0, e: messageValidate.length }],
        },
        message,
      );

    const projectCode = args[0] ?? '';
    const yesterdayText = extractText(content, 'Yesterday');
    const todayText = extractText(content, 'Today');
    const blockText = extractText(content, 'Block');
    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `Daily On ${formattedDate}`,
        fields: [
          {
            name: 'Project:',
            value: projectCode,
            inputs: {
              id: `daily-${messageid}-project`,
              type: EMessageComponentType.SELECT,
              component: {
                options: [
                  {
                    label: 'Meo 1',
                    value: 'meo 1',
                  },
                  {
                    label: 'Meo 2',
                    value: 'meo 2',
                  },
                ],
                required: true,
              },
            },
          },
          {
            name: 'Yesterday:',
            value: '',
            inputs: {
              id: `daily-${messageid}-yesterday-ip`,
              type: EMessageComponentType.INPUT,
              component: {
                id: `daily-${messageid}-yesterday-plhder`,
                placeholder: 'Ex. Write something',
                required: true,
                textarea: true,
                value: yesterdayText,
              },
            },
          },
          {
            name: 'Today:',
            value: '',
            inputs: {
              id: `daily-${messageid}-today-ip`,
              type: EMessageComponentType.INPUT,
              component: {
                id: `daily-${messageid}-today-plhder`,
                placeholder: 'Ex. Write something',
                required: true,
                textarea: true,
                value: todayText,
              },
            },
          },
          {
            name: 'Block:',
            value: '',
            inputs: {
              id: `daily-${messageid}-block-ip`,
              type: EMessageComponentType.INPUT,
              component: {
                id: `daily-${messageid}-block-plhder`,
                placeholder: 'Ex. Write something',
                required: true,
                textarea: true,
                type: EMessageSelectType.TEXT,
                value: blockText,
              },
            },
          },
          {
            name: 'Working time:',
            value: '',
            inputs: {
              id: `daily-${messageid}-working-time`,
              type: EMessageComponentType.INPUT,
              component: {
                id: `daily-${messageid}-working-time-plhder`,
                placeholder: 'Ex. Write something',
                required: true,
                textarea: true,
              },
            },
          },
          {
            name: 'Working Hours Type:',
            value: '',
            inputs: {
              id: `daily-${messageid}-working-hours-type`,
              type: EMessageComponentType.SELECT,
              component: {
                options: [
                  {
                    label: 'Normal Time',
                    value: 'normal-time',
                  },
                  {
                    label: 'Overtime',
                    value: 'overtime',
                  },
                ],
                required: true,
              },
            },
          },
        ],

        timestamp: new Date().toISOString(),
      },
    ];
    const components = [
      {
        components: [
          {
            id: `daily-${messageid}-${clanId}-${modeMess}-${codeMess}-${isPublic}-${ownerSenderDaily}-button-cancel`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `daily-${messageid}-${clanId}-${modeMess}-${codeMess}-${isPublic}-${ownerSenderDaily}-button-submit`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Submit`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ];

    if (onlyDailySyntax || !messageValidate)
      return this.replyMessageGenerate(
        {
          embed,
          components,
        },
        message,
      );
  }
}
