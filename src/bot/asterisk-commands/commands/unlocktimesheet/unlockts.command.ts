import { ChannelMessage, EButtonMessageStyle, EMarkdownType } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import {
  EmbedProps,
  EMessageComponentType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoleMezon, UnlockTimeSheet, User } from 'src/bot/models';
import { ClientConfigService } from 'src/bot/config/client-config.service';

@Command('unlockts')
export class UnlockTimeSheetCommand extends CommandMessage {
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(UnlockTimeSheet)
    private unlockTimeSheetRepository: Repository<UnlockTimeSheet>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private clientConfigService: ClientConfigService,
    @InjectRepository(RoleMezon)
    private roleMezonRepository: Repository<RoleMezon>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const findUser = await this.userRepository.findOne({
      where: { userId: message.sender_id },
    });
    const rolePM = await this.roleMezonRepository.findOne({
      where: {
        clan_id: this.clientConfigService.clandNccId,
        title: 'PM',
      },
    });
    if (!findUser) return;
    const isPm = findUser?.roles?.includes(rolePM?.id ?? 'staff');
    const component = [
      {
        label: 'Bạn là Staff:',
        value: 'unlockTs_STAFF',
        description:
          '- Nhân viên unlock để log timesheet tuần trước.\n- 20,000 vnđ/lần (trừ vào token).\n- Chỉ unlock được cho tuần trước, nếu muốn unlock cho tuần trước nữa, vui lòng liên hệ HR hoặc IT.',
        style: EButtonMessageStyle.PRIMARY,
      },
    ];
    if (isPm) {
      component.unshift({
        label: 'Bạn là PM:',
        value: 'unlockTs_PM',
        description:
          '- PM unlock để approve/reject timesheet cho team member.\n- 50,000 vnđ/lần (trừ vào token).',
        style: EButtonMessageStyle.PRIMARY,
      });
    }
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `You want to UNLOCK TIMESHEET?`,
        fields: [
          {
            name: '',
            value: '',
            inputs: {
              id: `RADIO`,
              type: EMessageComponentType.RADIO,
              component,
            },
          },
          {
            name: 'Bạn có chắc chắn muốn unlock timesheet?\nTiền phạt sẽ không được hoàn trả!',
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
            id: 'unlockTs_CANCEL',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: 'unlockTs_CONFIRM',
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
    const dataInsert = new UnlockTimeSheet();
    dataInsert.messageId = response.message_id;
    dataInsert.userId = message.sender_id;
    dataInsert.clanId = message.clan_id;
    dataInsert.channelId = message.channel_id;
    dataInsert.modeMessage = message.mode;
    dataInsert.isChannelPublic = message.is_public;
    dataInsert.createdAt = Date.now();
    await this.unlockTimeSheetRepository.save(dataInsert);
    return null;
  }
}
