import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { DynamicMezon, User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { CommandMessage } from '../../abstracts/command.abstract';
import { ChannelMessage } from 'mezon-sdk';
import { TABLE } from 'src/bot/constants/table';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';
import axios from 'axios';
import { CommandStorage } from 'src/bot/base/storage';

@Command('register')
export class DynamicCommand extends CommandMessage {
  constructor(
    @InjectRepository(DynamicMezon)
    private dynamicRepository: Repository<DynamicMezon>,
    private dynamicCommandService: DynamicCommandService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    try {
      if (message.username === 'Anonymous') {
        const messageContent = "```Anonymous can't use this command!```";
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      if (!args[0] || !args[1]) {
        const messageContent =
          '```' +
          'Command: *register commandname url' +
          '\n' +
          'Example: *register ncc https://ncc.asia/assets/images/logo.png' +
          '```';
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      const custCommandList =
        this.dynamicCommandService.getDynamicCommandList();
      const allCommands = CommandStorage.getAllCommands();
      const allCommandKeys = Array.from(allCommands.keys());
      if ([...allCommandKeys, ...custCommandList].includes(args[0])) {
        const messageContent = '```This command existed!```';
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }

      if (args[0] === 'check' || args[0] === 'delete') {
        if (!args[1]) return;
        const findCommand = await this.dynamicRepository.findOne({
          where: { command: args[1] },
        });

        if (!findCommand) {
          const messageContent =
            '```' + `Can't find command ${args[1]}` + '```';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }

        const findUser = await this.userRepository.findOne({
          where: { userId: findCommand.userId },
        });

        if (findUser && args[0] === 'delete') {
          if (findUser.userId === message.sender_id) {
            await this.dynamicRepository
              .createQueryBuilder()
              .delete()
              .from(DynamicMezon)
              .where('command = :command', { command: args[1] })
              .execute();
            const messageContent =
              '```' + `Delete ${args[1]} successful!` + '```';
            this.dynamicCommandService.initDynamicCommandList();
            return this.replyMessageGenerate(
              {
                messageContent,
                mk: [{ type: 't', s: 0, e: messageContent.length }],
              },
              message,
            );
          } else {
            const messageContent =
              '```' + `You can only delete the command you created.` + '```';
            return this.replyMessageGenerate(
              {
                messageContent,
                mk: [{ type: 't', s: 0, e: messageContent.length }],
              },
              message,
            );
          }
        }

        if (findUser && args[0] === 'check') {
          const messageContent =
            '```' +
            `Id: ${findCommand.id}, name: ${findCommand.command}, author: ${findUser.username}` +
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
      const output = args.slice(1).join(' ');
      const response = await axios.head(output);
      const contentType = response.headers['content-type'];
      const extension = output.split('.').pop()?.toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(
        extension,
      ); // use with contentType=binary/octet-stream
      const isVideo = [
        'mp4',
        'mov',
        'avi',
        'wmv',
        'flv',
        'mkv',
        'webm',
      ].includes(extension); // use with contentType=binary/octet-stream
      if (
        contentType.includes('image') ||
        contentType.includes('video') ||
        (contentType.includes('binary/octet-stream') && (isImage || isVideo))
      ) {
        await this.dynamicRepository
          .createQueryBuilder(TABLE.DYNAMIC)
          .insert()
          .into(DynamicMezon)
          .values({
            userId: message.sender_id,
            command: args[0],
            output: JSON.stringify(output),
          })
          .execute();
        const messageContent = '```' + '✅ Dynamic saved.' + '```';
        this.dynamicCommandService.initDynamicCommandList();

        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      } else {
        const messageContent = "```Can't process this attachment!```";
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
    } catch (error) {
      const messageContent = "```Getting an error when trying to process this attachment!```";
      return this.replyMessageGenerate(
        {
          messageContent: messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    }
  }
}
