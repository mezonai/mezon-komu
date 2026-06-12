import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { InjectRepository } from '@nestjs/typeorm';
import { MezonClan } from 'src/bot/models';
import { Repository } from 'typeorm';

@Command('blockcommand')
export class BlockCommand extends CommandMessage {
  constructor(
    @InjectRepository(MezonClan)
    private mezonClanRepository: Repository<MezonClan>,
  ) {
    super();
  }

  private readonly adminUserIds = [
    '1827994776956309504',
    '1779815181480628224',
  ];

  messHelp =
    'Command *blockcommand add clan_id command_name' +
    '\n' +
    '*blockcommand remove clan_id command_name' +
    '\n' +
    '*blockcommand list clan_id';

  async execute(args: string[], message: ChannelMessage) {
    if (!this.adminUserIds.includes(message.sender_id)) {
      return this.replyMessageGenerate(
        {
          messageContent:
            '❌You do not have permission to execute this command!',
        },
        message,
      );
    }

    const action = args[0]?.toLowerCase();
    const clanId = args[1];
    const commandName = args[2]?.replace(/^\*/, '').toLowerCase();

    if (!['add', 'remove', 'list'].includes(action) || !clanId) {
      return this.replyMessageGenerate(
        { messageContent: this.messHelp },
        message,
      );
    }

    const clan = await this.findOrCreateClan(clanId, message.sender_id);
    const blockedCommands = (clan.blocked_commands ?? []).map((command) =>
      command.toLowerCase(),
    );

    if (action === 'list') {
      return this.replyMessageGenerate(
        {
          messageContent: blockedCommands.length
            ? `Blocked commands for clan ${clanId}: ${blockedCommands.join(', ')}`
            : `Clan ${clanId} has no blocked commands.`,
        },
        message,
      );
    }

    if (!commandName) {
      return this.replyMessageGenerate(
        { messageContent: this.messHelp },
        message,
      );
    }

    const nextBlockedCommands =
      action === 'add'
        ? Array.from(new Set([...blockedCommands, commandName]))
        : blockedCommands.filter((command) => command !== commandName);

    await this.mezonClanRepository.update(clanId, {
      blocked_commands: nextBlockedCommands,
    });

    return this.replyMessageGenerate(
      {
        messageContent:
          action === 'add'
            ? `✅Blocked *${commandName} in clan ${clanId}!`
            : `✅Unblocked *${commandName} in clan ${clanId}!`,
      },
      message,
    );
  }

  private async findOrCreateClan(clanId: string, owner: string) {
    const clan = await this.mezonClanRepository.findOne({
      where: { clan_id: clanId },
    });
    if (clan) return clan;

    const newClan = this.mezonClanRepository.create({
      clan_id: clanId,
      clan_name: '',
      owner,
      can_use_command: false,
      blocked_commands: [],
      createdAt: Date.now(),
    });
    return this.mezonClanRepository.save(newClan);
  }
}
