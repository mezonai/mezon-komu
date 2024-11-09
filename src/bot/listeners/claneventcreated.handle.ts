import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { EMarkdownType, Events } from 'mezon-sdk';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { BetEventMezon, EventMezon, User } from '../models';
import { BetStatus, EmbedProps, EMessageMode } from '../constants/configs';
import { MessageQueue } from '../services/messageQueue.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';

@Injectable()
export class EventClanEventCreated extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(EventMezon)
    private eventMezonRepository: Repository<EventMezon>,
    private messageQueue: MessageQueue,
    @InjectRepository(BetEventMezon)
    private betEventMezonRepository: Repository<BetEventMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.ClanEventCreated)
  async handleClanEventCreated(data) {
    try {
      if (data.event_status === 'CREATED') {
        const EventMezonData = new EventMezon();
        EventMezonData.id = data.event_id;
        EventMezonData.logo = data.logo;
        EventMezonData.address = data.address;
        EventMezonData.clandId = data.clan_id;
        EventMezonData.channelId = data.channel_id;
        EventMezonData.timeStart = new Date(data.start_time).getTime();
        EventMezonData.timeEnd = new Date(data.end_time).getTime();
        EventMezonData.activeBet = true;
        EventMezonData.title = data.title;
        EventMezonData.description = data.description;

        await this.eventMezonRepository.insert(EventMezonData);
        const embed: EmbedProps = {
          color: '#ef0707',
          title: `Event ${data.title} has been created. Let's get some fun together!`,
          // url: 'https://discord.js.org',
          author: {
            name: 'KOMU',
            icon_url:
              'https://cdn.mezon.vn/1775731152322039808/1820659489792069632/mezon_logo.png',
            url: 'https://cdn.mezon.vn/1775731152322039808/1820659489792069632/mezon_logo.png',
          },
          // description: '',
          thumbnail: {
            url: 'https://cdn.mezon.vn/1775731152322039808/1820659489792069632/mezon_logo.png',
          },
          fields: [
            {
              name: '• Cách chơi',
              value: `Người tham gia sẽ sử dụng câu lệnh \n*bet ${data.event_id} user_number\nđể tham gia BET cho event opentalk này\nVí dụ: *bet ${data.event_id} 70\nKOMU sẽ gửi cho bạn 1 message và nhiệm vụ của bạn là xác nhận và chuyển số lượng token muốn BET cho KOMU. Khi thời gian của event opentalk mà bạn BET kết thúc, KOMU sẽ gửi kết quả số lượng người kết thúc của event opentalk đó tại channel BET.`,
            },
            {
              name: '• Luật lệ',
              value:
                '- KOMU sẽ nhận BET bắt đầu từ LÚC NÀY và ngưng nhận sau khi event opentalk bắt đầu.\n- Có thể BET nhiều lần cho 1 event opentalk.\n- Có thể BET nhiều event opentalk trong thời gian cho phép.',
            },
            {
              name: '• Tiền thưởng',
              value: `Nếu bạn đoán đúng, KOMU sẽ gửi cho bạn số lượng token tương đương với số token bạn đã BET với KOMU. Còn nếu bạn thua, bạn sẽ mất lượng token đó.`,
            },
            {
              name: 'Cơ hội cho mọi người là như nhau. Cùng BET thôi!',
              value: '',
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Powered by Mezon',
            icon_url:
              'https://cdn.mezon.vn/1775731152322039808/1820659489792069632/mezon_logo.png',
          },
        };
        const replyMessage = {
          clan_id: data.clan_id,
          channel_id: process.env.MEZON_BET_CHANNEL_ID,
          is_public: false,
          parent_id: '0',
          mode: EMessageMode.THREAD_MESSAGE,
          msg: {
            t: '',
            embed,
          },
        };
        this.messageQueue.addMessage(replyMessage);
      }

      // event completed
      if (data.event_status === 'COMPLETED') {
        const findEvent = await this.eventMezonRepository.findOne({
          where: {
            id: data.event_id,
            clandId: process.env.KOMUBOTREST_CLAN_NCC_ID,
          },
        });
        if (findEvent) {
          await this.eventMezonRepository.update(
            { id: data.event_id },
            { activeBet: false },
          );
          await this.handleSendToken(data);
        }
      }
    } catch (error) {
      console.log('handleClanEventCreated', error);
    }
  }

  async handleSendToken(data) {
    //find bet win
    const dataBetWin = await this.betEventMezonRepository.find({
      where: {
        eventId: data.event_id,
        amount: MoreThan(0), // payment
        content: 70 + '', // TODO: data usernumber after event finish
        status: IsNull(),
      },
    });

    //send token for winner
    for (let i = 0; i < dataBetWin.length; i++) {
      const sendToken = await this.client.sendToken(
        dataBetWin[i].userId,
        +dataBetWin[i].amount * 2,
      );
      if (sendToken?.amount) {
        // update status
        await this.betEventMezonRepository.update(
          { id: dataBetWin[i].id },
          { status: BetStatus.WIN },
        );
        const messageUser =
          '```' +
          `Id bet: ${dataBetWin[i].id}\nYou Won! KOMU just sent ${dataBetWin[i].amount} token for you. Please check your wallet!` +
          '```';
        const messageToUser: ReplyMezonMessage = {
          userId: dataBetWin[i].userId,
          textContent: messageUser,
          messOptions: { mk: [{ type: 't', s: 0, e: messageUser.length }] },
        };
        this.messageQueue.addMessage(messageToUser);
      } else {
        console.log('Send fail idBet ', dataBetWin[i].id, dataBetWin[i].amount);
      }
    }

    // update status
    await this.betEventMezonRepository.update(
      { content: Not('70'), eventId: data.event_id },
      { status: BetStatus.LOSE },
    );

    // total bet
    const resultTotalBet = dataBetWin.reduce((acc, obj) => {
      const existing = acc.find((item) => item.userId === obj.userId);
      if (existing) {
        existing.amount += obj.amount;
      } else {
        acc.push({ ...obj });
      }
      return acc;
    }, []);

    //send message to channel
    let messageText =
      '```' +
      `Ting Ting Ting\nEvent ${data.title} finised!\nCó 70 người tham gia khi event kết thúc!\nDanh sách số người dự đoán chính xác\n`;
    const userResults = await Promise.all(
      resultTotalBet.map(async (item) => {
        const findUser = await this.userRepository.findOne({
          where: { userId: item.userId },
        });
        return `${findUser.username} - token earned: ${item.amount}\n`;
      }),
    );
    messageText += userResults.length
      ? userResults.join('')
      : '(không có ai đúng cả)';
    messageText += '```';
    const replyMessage = {
      clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
      channel_id: process.env.MEZON_BET_CHANNEL_ID,
      is_public: false,
      parent_id: '0',
      mode: EMessageMode.THREAD_MESSAGE,
      msg: {
        t: messageText,
        mk: [{ type: EMarkdownType.TRIPLE, s: 0, e: messageText.length }],
      },
    };
    this.messageQueue.addMessage(replyMessage);
  }
}
