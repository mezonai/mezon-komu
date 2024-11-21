import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';

@Command('help')
export class HelpCommand extends CommandMessage {
  constructor(private dynamicCommandService: DynamicCommandService) {
    super();
  }

  execute(args: string[], message: ChannelMessage) {
    const allCommands = CommandStorage.getAllCommands();
    const allCommandsCustom =
      this.dynamicCommandService.getDynamicCommandList();
    const hidenCommandList = [
      'holiday',
      'register',
      'toggleactive',
      'checkchannel',
      'toggleprivatechannel',
      'togglechannel',
    ];
    const allCommandKeys = Array.from(allCommands.keys()).filter(
      (item) => !hidenCommandList.includes(item),
    );
    const messageContent =
      '```' +
      'KOMU - Help Menu' +
      '\n' +
      '• KOMU (' +
      allCommandKeys.length +
      ')' +
      '\n' +
      allCommandKeys.join(', ') +
      '\n• Custom Command (' +
      allCommandsCustom.length +
      ')' +
      '\n' +
      allCommandsCustom.join(', ') +
      '```';
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
