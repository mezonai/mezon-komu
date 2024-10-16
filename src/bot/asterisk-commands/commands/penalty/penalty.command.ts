import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { EPenaltyCommand } from './penalty.constants';
import { PenaltyService } from './penalty.services';

@Command('penalty')
export class PenaltyCommand extends CommandMessage {
  constructor(private readonly penaltyService: PenaltyService) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (args[0] === 'help' || !args[0]) {
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.HELP,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
        },
        message,
      );
    }

    if (args[0] === 'summary') {
      const result = await this.penaltyService.findPenatly(message.channel_id);
      let mess;
      if (Array.isArray(result) && result.length === 0) {
        mess = 'No result';
      } else {
        mess = result
          .map((item) => `${item.username} : ${item.ammount} vnd`)
          .join('\n');
      }
      const messageContent = '```' + 'Top bị phạt:' + '\n' + mess + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (args[0] === 'clear') {
      await Promise.all([
        this.penaltyService.clearPenalty(message.channel_id),
        this.penaltyService.updateIsRejectByChannelId(message.channel_id),
      ]);
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.CLEAR_PENALTY,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.CLEAR_PENALTY.length }],
        },
        message,
      );
    }

    const userMentioned = message.mentions[0];
    if (!userMentioned)
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.HELP,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
        },
        message,
      );
    // join arg when mentions
    const targetString = message.content.t.slice(
      userMentioned.s,
      userMentioned.e,
    );
    const firstIndex = args.findIndex((arg) => targetString.startsWith(arg));
    const lastIndex = args.findIndex((arg) => targetString.endsWith(arg)) + 1;
    const merged = args.slice(firstIndex, lastIndex).join(' ');
    args.splice(firstIndex, lastIndex - firstIndex, merged);

    if (!args[1]) {
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.HELP,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
        },
        message,
      );
    }
    const ammount = this.penaltyService.transAmmount(args[1]);

    if (args[0] === 'detail') {
      if (!args[1]) {
        return this.replyMessageGenerate(
          {
            messageContent: EPenaltyCommand.HELP,
            mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
          },
          message,
        );
      }
      let dataPen;
      if (userMentioned.user_id) {
        dataPen = await this.penaltyService.findDataPenWithUserId(
          userMentioned.user_id,
          message.channel_id,
        );
      } else {
        dataPen = await this.penaltyService.findDataPenWithUsername(
          userMentioned.username,
          message.channel_id,
        );
      }

      if (!dataPen || (Array.isArray(dataPen) && dataPen.length === 0)) {
        return this.replyMessageGenerate(
          {
            messageContent: EPenaltyCommand.NO_RESULT,
            mk: [{ type: 't', s: 0, e: EPenaltyCommand.NO_RESULT.length }],
          },
          message,
        );
      }
      const mess = dataPen
        .map((item, index) => `${index + 1} - ${item.reason} (${item.ammount})`)
        .join('\n');
      const messageContent =
        '```' + `Lý do ${dataPen[0].username} bị phạt` + '\n' + mess + '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }

    if (!args[2] || !ammount) {
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.HELP,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.HELP.length }],
        },
        message,
      );
    }

    const reason = args.slice(2, args.length).join(' ');

    let users;
    if (userMentioned.user_id) {
      users = await this.penaltyService.findUserWithId(userMentioned.user_id);
    } else {
      users = await this.penaltyService.findUserWithUsername(
        userMentioned.username,
      );
    }

    if (!users)
      return this.replyMessageGenerate(
        {
          messageContent: EPenaltyCommand.NO_RESULT,
          mk: [{ type: 't', s: 0, e: EPenaltyCommand.NO_RESULT.length }],
        },
        message,
      );
    const newPenatlyData = await this.penaltyService.addNewPenatly(
      users[0].userId,
      users[0].username,
      ammount,
      reason,
      Date.now(),
      false,
      message.channel_id,
      false,
    );
    return this.replyMessageGenerate(
      { messageContent: EPenaltyCommand.PENALTY_SAVE },
      message,
    );
  }
}
