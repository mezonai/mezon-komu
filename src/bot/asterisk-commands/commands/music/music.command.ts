import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { MezonClientService } from 'src/mezon/services/client.service';

import { MusicService } from 'src/bot/services/music.services';

@Command('music')
export class MusicCommand extends CommandMessage {
  private client: MezonClient;

  constructor(
    private clientService: MezonClientService,
    private musicService: MusicService,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (args.length < 2) return;
    const feature: string = args[0];
    args.shift();
    const songNameArray = args;
    switch (feature) {
      case 'search':
        return this.musicService.getMusicListMessage(
          message,
          songNameArray.join('+'),
          1,
        );
        break;
      default:
    }

    return this.replyMessageGenerate({}, message);
  }
}
