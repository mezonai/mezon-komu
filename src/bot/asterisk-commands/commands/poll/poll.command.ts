import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { EmbedProps, MEZON_EMBED_FOOTER } from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { MezonBotMessage } from 'src/bot/models';
import { Repository } from 'typeorm';
import { PollService } from 'src/bot/services/poll.service';

@Command('poll')
export class PollCommand extends CommandMessage {
  protected client: MezonClient;
  constructor(
    private clientService: MezonClientService,
    private pollService: PollService,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage, commandName?: string) {
    const clan = this.client.clans.get(message.clan_id!);
    const channel = await clan?.channels.fetch(message.channel_id);
    const messageChannel = await  channel?.messages.fetch(message.message_id!);;
    const defaultNumberOption = 2;
    const color = getRandomColor();
    const embed: EmbedProps[] = [
      {
        color,
        title: `POLL CREATOR`,
        fields: this.pollService.generateFieldsCreatePoll(defaultNumberOption),
        timestamp: new Date().toISOString(),
        footer: MEZON_EMBED_FOOTER,
      },
    ];
    const components = this.pollService.generateComponentsCreatePoll(
      defaultNumberOption,
      color,
      (message.clan_nick || message.username) ?? '',
      message.clan_id ?? '',
      message.sender_id
    );
    await messageChannel?.reply({ embed, components });
  }
}
