import { ChannelMessage, ChannelType, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { MeetingService } from './meeting.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon } from 'src/bot/models';
import { In, Repository } from 'typeorm';
import { messHelp } from './meeting.constants';
import { convertName } from 'src/bot/utils/helper';

@Command('meeting')
export class MeetingCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    private meetingService: MeetingService,
    private clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args.length) {
      const messageContent =
        await this.meetingService.handleMeetingNoArgs(message);
      return this.replyMessageGenerate(
        { messageContent, mk: [{ type: 'pre', s: 0, e: messageContent.length }] },
        message,
      );
    }
    if (args[0] === 'now') {
      let listChannelVoiceUsers = [];
      try {
        const clan = this.client.clans.get(message.clan_id);
        listChannelVoiceUsers = (
          await clan.listChannelVoiceUsers(
            '',
            ChannelType.CHANNEL_TYPE_GMEET_VOICE,
          )
        )?.voice_channel_users;
      } catch (error) {
        console.log('listChannelVoiceUsers', error);
      }

      const listVoiceChannel = await this.channelRepository.find({
        where: {
          channel_type: In([4, 10]),
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
        if (item.user_id !== message.sender_id) {
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
        let messageContent =
          currentUserVoiceChannel.length > 1
            ? `${message.clan_nick || message.display_name || message.username} is in ${currentUserVoiceChannel.length} voice channels!\n`
            : '';
        const hg = currentUserVoiceChannel.map((item) => {
          const findChannel = listVoiceChannel.find(
            (channel) => channel.channel_id === item.channel_id,
          );
          messageContent += `Everyone please join the voice channel #${findChannel?.channel_label || ''}\n`;
          return {
            channelid: item.channel_id,
            s:
              messageContent.length -
              (2 + (findChannel?.channel_label || '').length),
            e: messageContent.length - 1,
          };
        });
        return this.replyMessageGenerate(
          {
            messageContent: messageContent,
            hg: hg,
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

      const listType10 = listVoiceChannelAvalable.filter(
        (item) => item.channel_type === 10,
      );
      const listType3 = listVoiceChannelAvalable.filter(
        (item) => item.channel_type === 4,
      );

      let selectedChannel = null;

      if (listType10.length > 0) {
        const randomIndex = Math.floor(Math.random() * listType10.length);
        selectedChannel = listType10[randomIndex];
      } else if (listType3.length > 0) {
        const randomIndex = Math.floor(Math.random() * listType3.length);
        selectedChannel = listType3[randomIndex];
      }
      const findChannel = listVoiceChannel.find(
        (item) => item.channel_id === selectedChannel?.channel_id,
      );
      const messageContent = `Our meeting room is `;
      return this.replyMessageGenerate(
        {
          messageContent:
            messageContent + `#${findChannel?.channel_label || ''}`, // '#' at message is channel, auto fill at FE
          hg: [
            {
              channelid: selectedChannel?.channel_id,
              s: messageContent.length, // replace to '#' in text
              e:
                messageContent.length +
                1 +
                (findChannel?.channel_label || '').length, // replace to '#' in text
            },
          ],
        },
        message,
      );
    }

    if (args[0] === 'cancel') {
      if (!args[1])
        return this.replyMessageGenerate(
          {
            messageContent: '' + 'Command *report help' + '',
          },
          message,
        );

      if (args[1] === 'channel' && !args[2]) {
        const channelId = message.channel_id;
        const findChannelId =
          await this.meetingService.cancelMeetingByChannelId(channelId);
        return this.replyMessageGenerate(
          {
            messageContent: !findChannelId
              ? 'Not found.'
              : '✅ Cancel all channel meeting successfully.',
          },
          message,
        );
      }

      const id = args[1];
      const findId = await this.meetingService.cancelMeetingById(id);

      return this.replyMessageGenerate(
        {
          messageContent: !findId ? 'Not found.' : '✅ Cancel successfully.',
        },
        message,
      );
    }

    const task = args[0];
    let datetime = args.slice(1, 3).join(' ');
    let repeat = args[3];
    let repeatTime = args.slice(4).join(' ');
    const checkDate = args[1];
    let checkTime = args[2];
    let timestamp;

    if (repeat === 'first' || repeat === 'last') {
      repeat = checkTime;
      repeatTime = args.slice(3).join(' ');
      checkTime = checkDate;

      if (
        !this.meetingService.validateTime(checkTime) ||
        repeat !== 'monthly'
      ) {
        return this.replyMessageGenerate(
          {
            messageContent: messHelp,
            mk: [{ type: 'pre', s: 0, e: messHelp.length }],
          },
          message,
        );
      } else {
        const currentDate = new Date();
        const [hours, minutes] = checkTime.split(':');
        currentDate.setHours(Number(hours), Number(minutes));
        timestamp = currentDate.getTime();
      }
    }

    if (repeatTime !== 'first' && repeatTime !== 'last') {
      if (
        !this.meetingService.validateRepeatTime(repeatTime) ||
        !this.meetingService.validateDate(checkDate) ||
        !this.meetingService.validateTime(checkTime)
      ) {
        return this.replyMessageGenerate(
          {
            messageContent: messHelp,
            mk: [{ type: 'pre', s: 0, e: messHelp.length }],
          },
          message,
        );
      } else {
        const day = datetime.slice(0, 2);
        const month = datetime.slice(3, 5);
        const year = datetime.slice(6);

        const format = `${month}/${day}/${year}`;
        const dateObject = new Date(format);
        timestamp = dateObject.getTime();
      }
    }

    if (!repeat) repeat = 'once';
    const allowedRepeats = ['once', 'daily', 'weekly', 'repeat', 'monthly'];
    if (!allowedRepeats.includes(repeat)) {
      return this.replyMessageGenerate(
        {
          messageContent: messHelp,
          mk: [{ type: 'pre', s: 0, e: messHelp.length }],
        },
        message,
      );
    }

    await this.meetingService.saveMeeting(
      message.channel_id,
      task,
      timestamp,
      repeat,
      repeatTime,
    );
    return this.replyMessageGenerate(
      {
        messageContent: '✅ Meeting saved.',
      },
      message,
    );
  }
}
