import { ChannelMessage, EButtonMessageStyle, EMessageComponentType } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import {
  EmbedProps,
  ERequestAbsenceType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { InjectRepository } from '@nestjs/typeorm';
import { User, AbsenceDayRequest } from '../../../models';
import { TimeSheetService } from '../../../services/timesheet.services';
import { Repository } from 'typeorm';
import { MezonClientService } from '../../../../mezon/services/client.service';
@Command('offcustom')
export class CustomAbsenceCommand extends CommandMessage {
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
    const senderId = message.sender_id;
    const findUser = await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :userId`, { userId: senderId })
      .andWhere(`"deactive" IS NOT true`)
      .select('*')
      .getRawOne();
    if (!findUser) return;
    const embed: EmbedProps[] = [
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
              type: EMessageComponentType.INPUT,
              required: true,
              component: {
                id: 'date',
                placeholder: 'dd-mm-yyyy',
                required: true,
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
                required: true,
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
              required: true,
              component: {
                id: 'hour',
                placeholder: 'Số giờ',
                required: true,
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
                required: false,
                textarea: true,
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
            id: 'offcustom_CANCEL',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: 'offcustom_CONFIRM',
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
    const dataInsert = new AbsenceDayRequest();
    dataInsert.messageId = response.message_id;
    dataInsert.userId = message.sender_id;
    dataInsert.clanId = message.clan_id;
    dataInsert.channelId = message.channel_id;
    dataInsert.modeMessage = message.mode;
    dataInsert.isChannelPublic = message.is_public;
    dataInsert.createdAt = Date.now();
    dataInsert.type = ERequestAbsenceType.OFF;
    await this.absenceDayRequestRepository.save(dataInsert);
    return null;
  }
}
