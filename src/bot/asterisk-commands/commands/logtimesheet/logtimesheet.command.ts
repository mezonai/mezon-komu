/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { ChannelMessage } from 'mezon-sdk';
import { EButtonMessageStyle } from 'mezon-sdk';
import { CommandMessage } from '../../abstracts/command.abstract';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Daily, User } from 'src/bot/models';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { TimeSheetService } from 'src/bot/services/timesheet.services';
import {
  extractText,
  findProjectByLabel,
  getRandomColor,
} from 'src/bot/utils/helper';
import {
  EmbedProps,
  EMessageComponentType,
  MEZON_EMBED_FOOTER,
  optionTypeOfWork,
} from 'src/bot/constants/configs';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';

export enum EMessageSelectType {
  TEXT = 1,
  USER = 2,
  ROLE = 3,
  CHANNEL = 4,
}

@Command('logts')
export class LogTimeSheetCommand extends CommandMessage {
  constructor(
    private timeSheetService: TimeSheetService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Daily) private dailyRepository: Repository<Daily>,
    private readonly clientConfigService: ClientConfigService,
    private readonly axiosClientService: AxiosClientService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const isLogByWeek = args?.[0]?.toLowerCase() === 'week' ? true : false;
    const messageid = message.message_id;
    const clanId = message.clan_id;
    const codeMess = message.code;
    const modeMess = message.mode;
    const isPublic = message.is_public;
    const ownerSenderDaily = message.sender_id;
    const ownerSenderDailyEmail = message.username + '@ncc.asia';
    const urlGetTasks = `${process.env.TIMESHEET_API}Mezon/GetProjectsIncludingTasks?emailAddress=${ownerSenderDailyEmail}`;
    const responseTasks = await this.axiosClientService.get(urlGetTasks, {
      headers: {
        securityCode: process.env.SECURITY_CODE,
        accept: 'application/json',
      },
    });
    const taskMetaData = responseTasks?.data?.result;
    const optionsProject = taskMetaData?.map((project) => ({
      label: project.projectName,
      value: project.id,
    }));
    const projectDefault = optionsProject[optionsProject.length - 1];
    const getTaskByProjectId = taskMetaData.find(
      (p) => p.id === projectDefault.value,
    );
    const optionsTask = getTaskByProjectId?.tasks?.map((task) => ({
      label: task.taskName,
      value: task.projectTaskId,
    }));
    const taskDefault = optionsTask?.[0];
    //////

    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `Log Timesheet ${isLogByWeek ? 'for This Week' : 'By Date'} `,
        fields: [
          ...(!isLogByWeek
            ? [
                {
                  name: 'Date:',
                  value: '',
                  inputs: {
                    id: `logts-${messageid}-date`,
                    type: EMessageComponentType.DATEPICKER,
                  },
                },
              ]
            : []),
          {
            name: 'Project:',
            value: '',
            inputs: {
              id: `logts-${messageid}-project`,
              type: EMessageComponentType.SELECT,
              component: {
                options: optionsProject,
                required: true,
                valueSelected: projectDefault,
              },
            },
          },
          {
            name: 'Task:',
            value: '',
            inputs: {
              id: `logts-${messageid}-task`,
              type: EMessageComponentType.SELECT,
              component: {
                options: optionsTask,
                required: true,
                valueSelected: taskDefault,
              },
            },
          },

          {
            name: 'Note:',
            value: '',
            inputs: {
              id: `logts-${messageid}-note`,
              type: EMessageComponentType.INPUT,
              component: {
                placeholder: 'Ex. Write something',
                required: true,
                textarea: true,
              },
            },
          },
          {
            name: 'Working time:',
            value: '',
            inputs: {
              id: `logts-${messageid}-working-time`,
              type: EMessageComponentType.INPUT,
              component: {
                placeholder: 'Ex. Enter Workingtime',
                required: true,
                defaultValue: 8,
                type: 'number',
              },
            },
          },

          {
            name: 'Type Of Work:',
            value: '',
            inputs: {
              id: `logts-${messageid}-type-of-work`,
              type: EMessageComponentType.SELECT,
              component: {
                options: optionTypeOfWork,
                required: true,
                valueSelected: optionTypeOfWork[0],
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
            id: `logts_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_${ownerSenderDaily}_${ownerSenderDailyEmail}_${isLogByWeek}_cancel`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `logts_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_${ownerSenderDaily}_${ownerSenderDailyEmail}_${isLogByWeek}_submit`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Submit`,
              style: EButtonMessageStyle.SUCCESS,
            },
          },
        ],
      },
    ];

    return this.replyMessageGenerate(
      {
        embed,
        components,
      },
      message,
    );
  }
}
