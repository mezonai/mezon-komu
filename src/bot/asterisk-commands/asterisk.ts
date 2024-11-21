import { AsteriskInterface } from './interfaces/asterisk.interface';
import { CommandMessage } from './abstracts/command.abstract';
import { ChannelMessage } from 'mezon-sdk';
import { extractMessage } from '../utils/helper';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CommandStorage } from '../base/storage';
import { DynamicCommandService } from '../services/dynamic.service';

@Injectable()
export class Asterisk implements AsteriskInterface {
  public commandList: { [key: string]: CommandMessage };

  constructor(
    private readonly moduleRef: ModuleRef,
    private dynamicCommandService: DynamicCommandService,
  ) {}

  execute(messageContent: string, message: ChannelMessage) {
    const [commandName, args] = extractMessage(messageContent);

    const target = CommandStorage.getCommand(commandName as string);
    if (target) {
      const command = this.moduleRef.get(target);

      if (command) {
        return command.execute(args, message);
      }
    }

    const dynamicCommandList =
      this.dynamicCommandService.getDynamicCommandList();
    if (dynamicCommandList.includes(commandName)) {
      const target = CommandStorage.getCommandDynamic('dynamic');
      const command = this.moduleRef.get(target);

      if (command) {
        return command.execute(args, message, commandName);
      }
    }
  }
}
