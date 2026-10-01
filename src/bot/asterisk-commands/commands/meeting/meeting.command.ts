import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { MeetingService } from './meeting.services';
import { MezonClientService } from 'src/mezon/services/client.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelMezon } from 'src/bot/models';
import { In, Repository } from 'typeorm';
import { messHelp } from './meeting.constants';
import { VoiceUsersCacheService } from 'src/bot/services/voiceUserCache.services';
import { VoiceRoomAllocatorService } from 'src/bot/services/voiceRoomAllocator.services';

const ADMIN_USER_ID = '1827994776956309504';

@Command('meeting')
export class MeetingCommand extends CommandMessage {
  private client: MezonClient;
  constructor(
    private meetingService: MeetingService,
    private clientService: MezonClientService,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    private voiceUsersService: VoiceUsersCacheService,
    private voiceRoomAllocator: VoiceRoomAllocatorService,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  async execute(args: string[], message: ChannelMessage) {
    if (!args.length) {
      const messageContent =
        await this.meetingService.handleMeetingNoArgs(message);
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 'pre', s: 0, e: messageContent.length }],
        },
        message,
      );
    }
    if (args[0] === 'cache') {
      if (message.sender_id !== ADMIN_USER_ID) return;

      const cachedVoiceUsers =
        this.voiceUsersService.getCachedMezonVoiceUsers(message.clan_id);
      let voiceRoomData = 'Chưa có dữ liệu cache voice cho clan này.';

      if (cachedVoiceUsers) {
        const listVoiceChannel = await this.channelRepository.find({
          where: {
            channel_type: In([4, 10]),
            clan_id: message.clan_id,
          },
        });
        const occupiedChannels = new Map<string, Set<string>>();
        cachedVoiceUsers.forEach((item) => {
          const userIds = item.user_ids?.filter(Boolean) ?? [];
          if (!item.channel_id || !userIds.length) return;

          const channelUsers =
            occupiedChannels.get(item.channel_id) ?? new Set<string>();
          userIds.forEach((userId) => channelUsers.add(userId));
          occupiedChannels.set(item.channel_id, channelUsers);
        });

        const occupiedChannelLines = Array.from(occupiedChannels.entries()).map(
          ([channelId, userIds], index) => {
            const channel = listVoiceChannel.find(
              (item) => item.channel_id === channelId,
            );
            const channelName = channel?.channel_label || channelId;
            return `${index + 1}. ${channelName} — ${userIds.size} người\n   IDs: ${Array.from(userIds).join(', ')}`;
          },
        );
        voiceRoomData = occupiedChannelLines.length
          ? `Cache phòng voice đang có người (${occupiedChannelLines.length})\n${occupiedChannelLines.join('\n')}`
          : 'Cache hiện không có phòng voice nào có người.';
      }

      const admin = await this.client.users.fetch(ADMIN_USER_ID);
      return admin.sendDM({ t: voiceRoomData });
    }

    if (args[0] === 'now') {
      let listChannelVoiceUsers = [];
      try {
        listChannelVoiceUsers =
          await this.voiceUsersService.listMezonVoiceUsers(message.clan_id);
      } catch (error) {
        const admin = await this.client.users.fetch(ADMIN_USER_ID);
        await admin.sendDM({
          t: `Lỗi khi fetch data user invoice: ${error}`,
        });
        return this.replyMessageGenerate(
          {
            messageContent: 'An error occurred, so I couldn’t send you an empty voice room.',
          },
          message,
        );
      }
      const listVoiceChannel = await this.channelRepository.find({
        where: {
          channel_type: In([4, 10]),
          clan_id: message.clan_id,
        },
      });

      const filter = new Set();
      const currentUserVoiceChannel = listChannelVoiceUsers.filter((item) => {
        const userIds = item.user_ids?.filter(Boolean) ?? [];
        if (!userIds.includes(message.sender_id)) {
          return false;
        }
        const identifier = `${message.sender_id}-${item.channel_id}`;
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
            channelId: item.channel_id,
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

      const selectedChannel =
        await this.voiceRoomAllocator.allocatePreferredRoom(
          message.clan_id,
          message.sender_id,
        );
      if (!selectedChannel) {
        return this.replyMessageGenerate(
          {
            messageContent: 'Voice channel full!',
          },
          message,
        );
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
              channelId: selectedChannel?.channel_id,
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
