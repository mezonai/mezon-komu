import { ChannelMessage } from 'mezon-sdk';
import { ReplyMezonMessage } from '../dto/replyMessage.dto';

export interface AsteriskInterface {
  execute: (
    messageContent: string,
    message: ChannelMessage,
    commandName?: string,
  ) => ReplyMezonMessage | null | ReplyMezonMessage[];
}
