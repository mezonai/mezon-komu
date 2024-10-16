import { ChannelMessage } from 'mezon-sdk';
import { ReplyMezonMessage } from '../dto/replyMessage.dto';
import { replyMessageGenerate } from 'src/bot/utils/generateReplyMessage';

export abstract class CommandMessage {
  abstract execute(args: string[], message: ChannelMessage): any;

  replyMessageGenerate(
    replayConent: { [x: string]: any },
    message: ChannelMessage,
    hasRef: boolean = true,
  ): ReplyMezonMessage {
    return replyMessageGenerate(replayConent, message, hasRef);
  }
}
