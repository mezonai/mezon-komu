import { ChannelMessage, EButtonMessageStyle } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import {
  EmbedProps, EMessageComponentType, ERequestAbsenceDayType,
  ERequestAbsenceType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { InjectRepository } from '@nestjs/typeorm';
import { User, AbsenceDayRequest } from '../../../models';
import { TimeSheetService } from '../../../services/timesheet.services';
import { Repository } from 'typeorm';
import { MezonClientService } from '../../../../mezon/services/client.service';
@Command('request')
export class RequestAbsenceDayCommand extends CommandMessage {
  constructor(
    private clientService: MezonClientService,
    private timeSheetService: TimeSheetService,
    @InjectRepository(AbsenceDayRequest)
    private absenceDayRequestRepository: Repository<AbsenceDayRequest>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const messageid = message.message_id;
    const clanId = message.clan_id;
    const codeMess = message.code;
    const modeMess = message.mode;
    const isPublic = message.is_public;
    const typeRequest = args[0];
    if (!typeRequest) return;
    const typeRequestDayEnum = ERequestAbsenceDayType[typeRequest.toUpperCase() as keyof typeof ERequestAbsenceDayType];
    if (!typeRequestDayEnum) return;

    if (typeRequestDayEnum === ERequestAbsenceDayType.HELP){
      return this.replyMessageGenerate(
        {
          messageContent: ERequestAbsenceDayType.HELP,
          mk: [{ type: 't', s: 0, e: ERequestAbsenceDayType.HELP.length }],
        },
        message,
      );
    }
    const senderId = message.sender_id;
    const findUser = await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :userId`, { userId: senderId })
      .andWhere(`"deactive" IS NOT true`)
      .select('*')
      .getRawOne();
    if (!findUser) return;
    let embed: EmbedProps[] = [];
    switch (typeRequestDayEnum) {
      case ERequestAbsenceDayType.REMOTE:
        embed = [
          {
            color: getRandomColor(),
            title: `Remote`,
            author: {
              name: findUser.username,
              icon_url: findUser.avatar,
              url: findUser.avatar,
            },
            fields: [
              {
                name: 'Date',
                value: '',
                inputs: {
                  id: 'dateAt',
                  type: EMessageComponentType.DATEPICKER,
                  component: {
                    value: '123456789',
                  },
                },
              },
              {
                name: 'Date Type',
                value: '',
                inputs: {
                  id: `dateType`,
                  type: EMessageComponentType.SELECT,
                  component: {
                    max_options: 1,
                    options: [
                      {
                        label: 'Full Day',
                        value: 'FULL_DAY',
                      },
                      {
                        label: 'Morning',
                        value: 'MORNING',
                      },
                      {
                        label: 'Afternoon',
                        value: 'AFTERNOON',
                      },
                    ],
                  },
                },
              },
              {
                name: 'Reason',
                value: '',
                inputs: {
                  id: 'reason',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'reason',
                    placeholder: 'Reason',
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        break;
      case ERequestAbsenceDayType.ONSITE:
        embed = [
          {
            color: getRandomColor(),
            title: `Onsite`,
            author: {
              name: findUser.username,
              icon_url: findUser.avatar,
              url: findUser.avatar,
            },
            fields: [
              {
                name: 'Date',
                value: '',
                inputs: {
                  id: 'dateAt',
                  type: EMessageComponentType.DATEPICKER,
                  component: {
                    value: '123456789',
                  },
                },
              },
              {
                name: 'Date Type',
                value: '',
                inputs: {
                  id: 'dateType',
                  type: EMessageComponentType.SELECT,
                  component: {
                    max_options: 1,
                    options: [
                      {
                        label: 'Full Day',
                        value: 'FULL_DAY',
                      },
                      {
                        label: 'Morning',
                        value: 'MORNING',
                      },
                      {
                        label: 'Afternoon',
                        value: 'AFTERNOON',
                      },
                    ],
                  },
                },
              },
              {
                name: 'Reason',
                value: '',
                inputs: {
                  id: 'reason',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'reason',
                    placeholder: 'Reason',
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        break;
      case ERequestAbsenceDayType.OFF:
        const absenceAllType = await this.timeSheetService.getAllTypeAbsence();
        const optionsAbsenceType = absenceAllType.data.result.map((item) => ({
          label: item.name,
          value: item.id,
        }));
        embed = [
          {
            color: getRandomColor(),
            title: `Off`,
            author: {
              name: findUser.username,
              icon_url: findUser.avatar,
              url: findUser.avatar,
            },
            fields: [
              {
                name: 'Date',
                value: '',
                inputs: {
                  id: 'dateAt',
                  type: EMessageComponentType.DATEPICKER,
                  component: {
                    value: '123456789',
                  },
                },
              },
              {
                name: 'Date Type',
                value: '',
                inputs: {
                  id: 'dateType',
                  type: EMessageComponentType.SELECT,
                  component: {
                    max_options: 1,
                    options: [
                      {
                        label: 'Full Day',
                        value: 'FULL_DAY',
                      },
                      {
                        label: 'Morning',
                        value: 'MORNING',
                      },
                      {
                        label: 'Afternoon',
                        value: 'AFTERNOON',
                      },
                    ],
                  },
                },
              },
              {
                name: 'Absence Type',
                value: '',
                inputs: {
                  id: 'absenceType',
                  type: EMessageComponentType.SELECT,
                  component: {
                    max_options: 1,
                    options: optionsAbsenceType,
                  },
                },
              },
              {
                name: 'Reason',
                value: '',
                inputs: {
                  id: 'reason',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'reason',
                    placeholder: 'Reason',
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        break;
      case ERequestAbsenceDayType.OFFCUSTOM:
        embed = [
          {
            color: getRandomColor(),
            title: `Đi muộn/ Về sớm`,
            author: {
              name: findUser.username,
              icon_url: findUser.avatar,
              url: findUser.avatar,
            },
            fields: [
              {
                name: 'Date',
                value: '',
                inputs: {
                  id: 'dateAt',
                  type: EMessageComponentType.DATEPICKER,
                  component: {
                    value: '123456789',
                  },
                },
              },
              {
                name: 'Absence Time',
                value: '',
                inputs: {
                  id: 'absenceTime',
                  type: EMessageComponentType.SELECT,
                  component: {
                    max_options: 1,
                    options: [
                      {
                        label: 'Đi muộn',
                        value: 'ARRIVE_LATE',
                      },
                      {
                        label: 'Về sớm',
                        value: 'LEAVE_EARLY',
                      },
                    ],
                  },
                },
              },
              {
                name: 'Số giờ',
                value: '',
                inputs: {
                  id: 'hour',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'hour',
                    placeholder: 'Số giờ',
                  },
                },
              },
              {
                name: 'Reason',
                value: '',
                inputs: {
                  id: 'reason',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'reason',
                    placeholder: 'Reason',
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        break;
      default:
        break;
    }

    const components = [
      {
        components: [
          {
            id: `${typeRequestDayEnum}_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_CANCEL`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: `${typeRequestDayEnum}_${messageid}_${clanId}_${modeMess}_${codeMess}_${isPublic}_CONFIRM`,
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
    const typeRequestEnum = ERequestAbsenceType[typeRequest.toUpperCase() as keyof typeof ERequestAbsenceType];
    const response = await this.clientService.sendMessage(dataSend);
    const dataInsert = new AbsenceDayRequest();
    dataInsert.messageId = response.message_id;
    dataInsert.userId = message.sender_id;
    dataInsert.clanId = message.clan_id;
    dataInsert.channelId = message.channel_id;
    dataInsert.modeMessage = message.mode;
    dataInsert.isChannelPublic = message.is_public;
    dataInsert.createdAt = Date.now();
    dataInsert.type = typeRequestEnum || ERequestAbsenceType.OFF;
    await this.absenceDayRequestRepository.save(dataInsert);
    return null;
  }
}
