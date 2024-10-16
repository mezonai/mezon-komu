import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

export class MessageQueue {
  private queue: ReplyMezonMessage[] = [];

  getMessageQueue() {
    return this.queue;
  }

  addMessage(message: ReplyMezonMessage) {
    this.queue.push(message);
  }

  getNextMessage(): ReplyMezonMessage | undefined {
    return this.queue.shift();
  }

  hasMessages(): boolean {
    return this.queue.length > 0;
  }
}
