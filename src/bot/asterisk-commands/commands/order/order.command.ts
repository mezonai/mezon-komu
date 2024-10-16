import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { OrderCommandService } from './order.services';
import { UtilsService } from 'src/bot/services/utils.services';
import { EOrderCommand } from './order.constants';

@Command('order')
export class OrderCommand extends CommandMessage {
  constructor(
    private readonly orderCommandService: OrderCommandService,
    private readonly utilsService: UtilsService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const channelId = message.channel_id;
    let author = message.sender_id;
    const findUser = await this.orderCommandService.getUserByUserId(author);
    if (!findUser) return;
    const username = findUser.email ?? message.username;
    if (!args[0]) {
      return this.replyMessageGenerate(
        { messageContent: EOrderCommand.EMPTY },
        message,
      );
    }

    if (args[0] === 'cancel') {
      const userCancel = await this.orderCommandService.getUserCancelOrder(
        channelId,
        author,
        username,
      );

      if (userCancel) {
        await Promise.all(
          userCancel.map((item) =>
            this.orderCommandService.upDateUserCancel(item),
          ),
        );
      }
      return this.replyMessageGenerate(
        { messageContent: EOrderCommand.CANCEL },
        message,
      );
    }

    if (args[0] === 'finish') {
      const userCancel = await this.orderCommandService.getListUserOrderPending(
        channelId,
        author,
        username,
      );

      if (!userCancel || userCancel.length === 0) {
        return this.replyMessageGenerate(
          { messageContent: EOrderCommand.CANT_FINISH },
          message,
        );
      }

      const listOrder = await this.orderCommandService.getListUserFinish(
        channelId,
        this.utilsService.getYesterdayDate(),
        this.utilsService.getTomorrowDate(),
      );

      if (!listOrder || listOrder.length === 0) {
        return this.replyMessageGenerate(
          { messageContent: EOrderCommand.NO_ORDER },
          message,
        );
      }
      const listMessage = [];
      for (let i = 0; i < listOrder.length; i += 50) {
        const chunk = listOrder.slice(i, i + 50);
        const mess = chunk
          .map((list) => `<${list.username}> order ${list.menu.toUpperCase()}`)
          .join('\n');

        listMessage.push(mess);
      }
      const messageContent = `Chốt đơn!!! Tổng là ${listOrder.length} người\n`;

      const reportOrder =
        await this.orderCommandService.updateFinishOrder(channelId);
      await Promise.all(
        reportOrder.map((item) =>
          this.orderCommandService.upDateUserCancel(item),
        ),
      );

      if (listMessage.length)
        return listMessage.map((mess) =>
          this.replyMessageGenerate(
            {
              messageContent: '```' + messageContent + mess + '```',
              mk: [
                {
                  type: 't',
                  s: 0,
                  e: (messageContent + mess).length + 6,
                },
              ],
            },
            message,
          ),
        );
    }

    const resultString = args.join(' ');
    const list = args.slice(0, args.length).join(' ');
    await this.orderCommandService
      .order(channelId, author, username, list)
      .catch((err) => console.log(err));
    return this.replyMessageGenerate(
      {
        messageContent:
          '✅ Bạn đã đặt ' + '`' + `${resultString}` + '`' + ' !!!',
        mk: [{ type: 's', s: 13, e: 15 + resultString.length }],
      },
      message,
    );
  }
}
