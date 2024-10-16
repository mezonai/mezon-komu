import { ChannelMessage, ChannelType, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon, User } from 'src/bot/models';
import { Repository } from 'typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';
import { MessageQueue } from 'src/bot/services/messageQueue.service';

@Command('where')
export class WhereCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private messageQueue: MessageQueue,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args.length) {
      const messageContent =
        '```' +
        'Command: *where usermame' +
        '\n' +
        'Example: *where a.nguyenvan' +
        '```';
      return this.replyMessageGenerate(
        { messageContent, mk: [{ type: 't', s: 0, e: messageContent.length }] },
        message,
      );
    }
    if (args[0]) {
      let listChannelVoiceUsers = [];
      let userQuery: string;
      try {
        if (
          Array.isArray(message.mentions) &&
          message.mentions.length &&
          args[0]?.startsWith('@')
        ) {
          const findUser = await this.userRepository.findOne({
            where: {
              userId: message.mentions[0].user_id,
              user_type: EUserType.MEZON,
            },
          });
          userQuery = findUser.username;
        } else {
          userQuery = args[0];
        }
        const findUser = await this.userRepository.findOne({
          where: { username: userQuery, user_type: EUserType.MEZON },
        });
        if (!findUser) {
          return this.replyMessageGenerate(
            {
              messageContent: '```Wrong Email!```',
              mk: [{ type: 't', s: 0, e: '```Wrong Email!```'.length }],
            },
            message,
          );
        }

        listChannelVoiceUsers = (
          await this.client.listChannelVoiceUsers(
            message.clan_id,
            '',
            ChannelType.CHANNEL_TYPE_VOICE,
          )
        )?.voice_channel_users;

        const filter = new Set();
        const currentUserVoiceChannelFindUser = listChannelVoiceUsers.filter(
          (item) => {
            if (item.participant !== findUser.display_name) {
              return false;
            }
            const identifier = `${item.user_id}-${item.channel_id}`;
            
            if (!filter.has(identifier)) {
              filter.add(identifier);
              return true;
            }
            return false;
          },
        );

        if (currentUserVoiceChannelFindUser.length) {
          let messageContent =
            currentUserVoiceChannelFindUser.length > 1
              ? `${findUser.username} is in ${currentUserVoiceChannelFindUser.length} voice channels!\n`
              : `Komu is connecting the call with ${findUser.username}\n`;
          const hg = currentUserVoiceChannelFindUser.map((item) => {
            messageContent += `#\n`; // '#' at message is channel, auto fill at FE
            return {
              channelid: item.channel_id,
              s: messageContent.length - 2, // replace to '#' in text
              e: messageContent.length - 1, // replace to '#' in text
            };
          });

          const messageToUser: ReplyMezonMessage = {
            userId: findUser.userId,
            textContent: messageContent,
            messOptions: {
              hg,
            },
          };
          this.messageQueue.addMessage(messageToUser);

          return this.replyMessageGenerate(
            {
              messageContent: `${findUser.username}'s voice room was sent to you!`,
            },
            message,
          );
        } else {
          return this.replyMessageGenerate(
            {
              messageContent:
                'The user is not currently participating in the voice room!',
            },
            message,
          );
        }
      } catch (error) {
        console.log('listChannelVoiceUsers', error);
      }
    }
  }
}
