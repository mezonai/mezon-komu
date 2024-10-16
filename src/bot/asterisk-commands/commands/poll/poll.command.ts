import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';

@Command('poll')
export class PollCommand extends CommandMessage {
  constructor() {
    super();
  }

  execute(args: string[], message: ChannelMessage) {
    let messageContent = '';
    const cmds = args.join(' ').split('+');
    const options = cmds.slice(1);
    const iconList = [
      '1️⃣: ',
      '2️⃣: ',
      '3️⃣: ',
      '4️⃣: ',
      '5️⃣: ',
      '6️⃣: ',
      '7️⃣: ',
      '8️⃣: ',
      '9️⃣: ',
      '🔟: ',
    ];
    if (
      !cmds.length ||
      !options.length ||
      options.length < 2 ||
      options.length > 10
    ) {
      const exampleText = `\nExample: *poll title + option1 + option2 + ...`;
      if (!cmds?.[0]) {
        messageContent = 'Poll title is not given!' + exampleText;
      } else if (!options.length) {
        messageContent = 'Poll options are not given!' + exampleText;
      } else if (options.length < 2) {
        messageContent = 'Please provide more than one choice!' + exampleText;
      } else if (options.length > 10) {
        messageContent =
          'Exceed the number of choices, maximum number of choices is 10';
      }
      return this.replyMessageGenerate(
        {
          messageContent: '```' + messageContent + '```',
          mk: [
            {
              type: 't',
              s: 0,
              e: messageContent.length + 6,
            },
          ],
        },
        message,
      );
    }
    messageContent =
      '```' +
      `[Poll] - ${cmds[0]}` +
      '\n' +
      'To vote, react using the corresponding emoji.' +
      '\n' +
      'The voting will end in 12 hours.' +
      '\n' +
      'Poll creater can end the poll forcefully by reacting to ✅ emoji.';
    options.forEach((option, index) => {
      messageContent += '\n' + iconList[index] + option.trim();
    });
    const textCreated =
      `\n(Only count by number of people and only 1 reaction is counted, if more, take the last one.` +
      `\nIf the last choice is deleted, it will be considered as not participating in this poll.)` +
      `\nPoll created by ${message.username}` +
      '```';
    return this.replyMessageGenerate(
      {
        messageContent: messageContent + textCreated,
        mk: [
          {
            type: 't',
            s: 0,
            e: messageContent.length + textCreated.length,
          },
        ],
      },
      message,
    );
  }
}
