import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';

@Command('help')
export class HelpCommand extends CommandMessage {
  constructor() {
    super();
  }

  execute(args: string[], message: ChannelMessage) {
    const allCommands = CommandStorage.getAllCommands();
    const hidenCommandList = [
      'holiday',
      'register',
      'toggleactive',
      'checkchannel',
      'toggleprivatechannel',
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
