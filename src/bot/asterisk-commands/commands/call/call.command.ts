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

@Command('call')
export class CallCommand extends CommandMessage {
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
    if (message.sender_id === '1827994776956309504') {
      const messageToUser: ReplyMezonMessage = {
        userId: '1827994776956309504',
        textContent: `Date system: ${new Date()}, giờ: ${new Date().getHours()}`,
      };
      this.messageQueue.addMessage(messageToUser);
    }
    if (!args.length) {
      const messageContent =
        '```' +
        'Command: *call usermame' +
        '\n' +
        'Example: *call a.nguyenvan' +
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

        const listVoiceChannel = await this.channelRepository.find({
          where: {
            channel_type: ChannelType.CHANNEL_TYPE_VOICE,
            clan_id: message.clan_id,
          },
        });
        const listVoiceChannelIdUsed = [];
        listChannelVoiceUsers.forEach((item) => {
          if (!listVoiceChannelIdUsed.includes(item.channel_id))
            listVoiceChannelIdUsed.push(item.channel_id);
        });
        const listVoiceChannelAvalable = listVoiceChannel.filter(
          (item) => !listVoiceChannelIdUsed.includes(item.channel_id),
        );

        const filter = new Set();
        const currentUserVoiceChannel = listChannelVoiceUsers.filter((item) => {
          if (item.participant !== message.display_name) {
            return false;
          }
          const identifier = `${item.user_id}-${item.channel_id}`;
          if (!filter.has(identifier)) {
            filter.add(identifier);
            return true;
          }
          return false;
        });

        if (currentUserVoiceChannel.length) {
          const messageContent = `Komu is connecting the call between ${message.username} and ${findUser.username}\n`;
          const userIdCall = [message.sender_id, findUser.userId];
          userIdCall.forEach((id) => {
            const messageToUser: ReplyMezonMessage = {
              userId: id,
              textContent: messageContent + '#',
              messOptions: {
                hg: [
                  {
                    channelid: currentUserVoiceChannel[0].channel_id,
                    s: messageContent.length, // replace to '#' in text
                    e: messageContent.length + 1, // replace to '#' in text
                  },
                ],
              },
            };
            this.messageQueue.addMessage(messageToUser);
          });

          return this.replyMessageGenerate(
            {
              messageContent: `Sent voice channel to ${findUser.username} succesful!`,
            },
            message,
          );
        }

        if (!listVoiceChannelAvalable.length) {
          return this.replyMessageGenerate(
            {
              messageContent: 'Voice channel full!',
            },
            message,
          );
        }

        const randomIndexVoiceChannel = Math.floor(
          Math.random() * listVoiceChannelAvalable.length,
        );
        const messageContent = `Komu is connecting the call between ${message.username} and ${findUser.username}\n`;
        const userIdCall = [message.sender_id, findUser.userId];
        userIdCall.forEach((id) => {
          const messageToUser: ReplyMezonMessage = {
            userId: id,
            textContent: messageContent + '#',
            messOptions: {
              hg: [
                {
                  channelid:
                    listVoiceChannelAvalable[randomIndexVoiceChannel]
                      .channel_id,
                  s: messageContent.length, // replace to '#' in text
                  e: messageContent.length + 1, // replace to '#' in text
                },
              ],
            },
          };
          this.messageQueue.addMessage(messageToUser);
        });

        return this.replyMessageGenerate(
          {
            messageContent: `Sent voice channel to ${findUser.username} and you succesful!`,
          },
          message,
        );
      } catch (error) {
        console.log('listChannelVoiceUsers', error);
      }
    }
  }
}
