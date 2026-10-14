import { AsteriskInterface } from './interfaces/asterisk.interface';
import { CommandMessage } from './abstracts/command.abstract';
import { ChannelMessage } from 'mezon-sdk';
import { extractMessage } from '../utils/helper';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CommandStorage } from '../base/storage';
import { DynamicCommandService } from '../services/dynamic.service';
import { findSimilarCommands } from '../utils/stringSimilarity';
import { replyMessageGenerate } from '../utils/generateReplyMessage';
import { HIDDEN_COMMAND_LIST } from '../constants/configs';

@Injectable()
export class Asterisk implements AsteriskInterface {
  public commandList: { [key: string]: CommandMessage };

  constructor(
    private readonly moduleRef: ModuleRef,
    private dynamicCommandService: DynamicCommandService,
  ) {}

  execute(messageContent: string, message: ChannelMessage) {
    const [commandName, args] = extractMessage(messageContent);
    if (!commandName || typeof commandName !== 'string') return;

    const target = CommandStorage.getCommand(commandName);
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

    const allCommands = Array.from(
      new Set([
        ...Array.from(CommandStorage.getAllCommands().keys()),
        ...dynamicCommandList,
      ]),
    ).filter((cmd) => !HIDDEN_COMMAND_LIST.includes(cmd));

    const suggestions = findSimilarCommands(commandName, allCommands);
    if (suggestions.length > 0) {
      const suggestionText = suggestions.map((cmd) => `*${cmd}`).join(', ');
      const content = `Command "*${commandName}" not found. Did you mean: ${suggestionText}?`;
      return replyMessageGenerate(
        {
          messageContent: content,
          mk: [{ type: 'pre', s: 0, e: content.length }],
        },
        message,
      );
    }
  }
}

