import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { EventService } from './event.service';
import { UtilsService } from 'src/bot/services/utils.services';

const messHelp =
  '```' +
  '*event' +
  '\n' +
  '*event help' +
  '\n' +
  '*event dd/MM/YYYY HH:mm title [users]' +
  '\n' +
  '*event cancel' +
  '```';

@Command('event')
export class EventCommand extends CommandMessage {
  constructor(
    private eventService: EventService,
    private utilsService: UtilsService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    let insertUser = [message.sender_id];
    if (!args[0]) {
      let list = await this.eventService.getListEvent(message.channel_id);
      console.log('list', list);
      let mess;
      const replyMessageList = [];
      if (!list || list.length === 0) {
        const messageContent = '`✅` No scheduled meeting.';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      } else {
        for (let i = 0; i <= Math.ceil(list.length / 50); i += 1) {
          if (list.slice(i * 50, (i + 1) * 50).length === 0) break;
          mess =
            '```' +
            '\n' +
            (
              await Promise.all(
                list.slice(i * 50, (i + 1) * 50).map(async (item) => {
                  const dateTime = this.utilsService.formatDate(
                    new Date(Number(item.createdTimestamp)),
                  );
                  let userMention = await Promise.all(
                    item.users.map((user) => {
                      return this.eventService.getDataUserById(user);
                    }),
                  );
                  const users = userMention
                    .map((user) => user.username)
                    .join(', ');
                  return (
                    `- ${item.title} ${dateTime} (ID: ${item.id}) with ${users}` +
                    '\n' +
                    (item.attachment ?? '')
                  );
                }),
              )
            ).join('\n') +
            '```';
          replyMessageList.push(mess);
        }
        return replyMessageList.map((reply) => {
          return this.replyMessageGenerate(
            {
              messageContent: reply,
              mk: [{ type: 't', s: 0, e: reply.length }],
            },
            message,
          );
        });
      }
    } else {
      if (args[0] === 'cancel') {
        if (!args[1]) {
          const messageContent = '```' + '*report help' + '```';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        const id = args[1];
        const eventId = await this.eventService.cancelEventById(id);
        if (!eventId) {
          return this.replyMessageGenerate(
            {
              messageContent: 'Not found!',
            },
            message,
          );
        } else {
          const messageContent = '```✅ Cancel successfully.```';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
      } else if (args[0] === 'help' || !args[3]) {
        return this.replyMessageGenerate(
          {
            messageContent: messHelp,
            mk: [{ type: 't', s: 0, e: messHelp.length }],
          },
          message,
        );
      } else {
        const title = args[2];
        const usersMention = args.slice(3, args.length - 1);
        let attachment;
        if (
          args[args.length - 1].startsWith('http://') ||
          args[args.length - 1].startsWith('https://')
        ) {
          attachment = args[args.length - 1];
        } else {
          usersMention.push(args[args.length - 1]);
        }
        const datetime = args.slice(0, 2).join(' ');
        const checkDate = args.slice(0, 1).join(' ');
        const checkTime = args.slice(1, 2).join(' ');
        if (usersMention.includes(message.username)) {
          return this.replyMessageGenerate(
            {
              messageContent: messHelp,
              mk: [{ type: 't', s: 0, e: messHelp.length }],
            },
            message,
          );
        }
        const user = await Promise.all(
          usersMention.map(async (user) => {
            const checkUser = await this.eventService.getDataUser(user);
            if (!checkUser) {
              return this.replyMessageGenerate(
                {
                  messageContent: 'User not found',
                },
                message,
              );
            } else {
              insertUser.push(checkUser.userId);
              return checkUser;
            }
          }),
        );
        if (user.includes(undefined)) {
          return this.replyMessageGenerate(
            {
              messageContent: messHelp,
            },
            message,
          );
        }
        if (
          !/^(((0[1-9]|[12]\d|3[01])\/(0[13578]|1[02])\/((19|[2-9]\d)\d{2}))|((0[1-9]|[12]\d|30)\/(0[13456789]|1[012])\/((19|[2-9]\d)\d{2}))|((0[1-9]|1\d|2[0-8])\/02\/((19|[2-9]\d)\d{2}))|(29\/02\/((1[6-9]|[2-9]\d)(0[48]|[2468][048]|[13579][26])|(([1][26]|[2468][048]|[3579][26])00))))$/.test(
            checkDate,
          )
        ) {
          return this.replyMessageGenerate(
            {
              messageContent: messHelp,
            },
            message,
          );
        }
        if (!/(2[0-3]|[01][0-9]):[0-5][0-9]/.exec(checkTime)) {
          return this.replyMessageGenerate(
            {
              messageContent: messHelp,
            },
            message,
          );
        }
        const day = datetime.slice(0, 2);
        const month = datetime.slice(3, 5);
        const year = datetime.slice(6);
        const fomat = `${month} / ${day} / ${year}`;
        const dateObject = new Date(fomat);
        const timestamp = dateObject.getTime();
        const createEvent = await this.eventService.saveEvent(
          title,
          timestamp,
          insertUser,
          message.channel_id,
          attachment,
        );
        if (!createEvent) {
          const messageContent = '```This event already exists!```';
          return this.replyMessageGenerate(
            {
              messageContent,
              mk: [{ type: 't', s: 0, e: messageContent.length }],
            },
            message,
          );
        }
        await this.eventService.notiCreateEvent(
          user,
          message,
          checkDate,
          checkTime,
          attachment,
          title,
        );
        const messageContent = '```✅ Event saved.```';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
    }
  }
}
