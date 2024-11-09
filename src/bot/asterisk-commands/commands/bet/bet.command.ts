import { ChannelMessage, MezonClient } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';
import { Repository } from 'typeorm';
import { BetEventMezon, EventMezon, User } from 'src/bot/models';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { MessageQueue } from 'src/bot/services/messageQueue.service';
import { ReplyMezonMessage } from '../../dto/replyMessage.dto';
import { MezonClientService } from 'src/mezon/services/client.service';

@Command('bet')
export class BetCommand extends CommandMessage {
  private TIME_UTC = 7 * 60 * 60 * 1000;
  private client: MezonClient;
  constructor(
    private dynamicCommandService: DynamicCommandService,
    @InjectRepository(EventMezon)
    private eventMezonRepository: Repository<EventMezon>,
    @InjectRepository(BetEventMezon)
    private betEventMezonRepository: Repository<BetEventMezon>,
    private messageQueue: MessageQueue,
    private clientService: MezonClientService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  isNumber(str: string) {
    return !isNaN(Number(str));
  }

  async generateQRCode(text: string): Promise<string> {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(text);
      return qrCodeDataUrl;
    } catch (error) {
      throw new Error('Không thể tạo mã QR.');
    }
  }

  async execute(args: string[], message: ChannelMessage) {
    try {
      if (!args[0] || !args[1]) {
        const messageContent = '```Missing data to bet!```';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      };
      const findEvent = await this.eventMezonRepository.findOne({
        where: {
          id: args[0],
          clandId: message.clan_id,
        },
      });
      if (!findEvent || !this.isNumber(args[1]) || +args[1] < 0) {
        const messageContent = !findEvent ? '```Bet fail. Cannot found BET id!```' : '```Bet fail. User number only take number!```';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      };;
      const timestampNow = new Date().getTime() + this.TIME_UTC; // utc +7
      if (!findEvent.activeBet || findEvent.timeStart < timestampNow) {
        const messageContent = '```Event was finished!```';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      const BetEventMezonData = new BetEventMezon();
      BetEventMezonData.userId = message.sender_id;
      BetEventMezonData.eventId = args[0];
      BetEventMezonData.content = args[1];
      BetEventMezonData.createdAt = Date.now();
      const saveData =
        await this.betEventMezonRepository.save(BetEventMezonData);
      const sendTokenData = {
        sender_id: message.sender_id,
        sender_name: message.username,
        receiver_id: process.env.BOT_KOMU_ID,
      };
      const qrCodeImage = await this.generateQRCode(
        JSON.stringify(sendTokenData),
      );
      const messageUser =
        '```' +
        `Id bet: ${saveData.id}\nPlease use your phone to scan to confirm and transfer token to\nEvent: ${findEvent.title}\nId: ${findEvent.id}` +
        '```';
      const messageToUser: ReplyMezonMessage = {
        userId: message.sender_id,
        textContent: messageUser,
        messOptions: { mk: [{ type: 't', s: 0, e: messageUser.length }] },
        attachments: [
          {
            url: qrCodeImage + '',
            filetype: 'image/jpeg',
          },
        ],
      };
      this.messageQueue.addMessage(messageToUser);
      const messageContent =
        '```' +
        `Id bet: ${saveData.id}\nTransaction is pending! Komu sent to you a message. Please check!` +
        '```';
      return this.replyMessageGenerate(
        {
          messageContent,
          mk: [{ type: 't', s: 0, e: messageContent.length }],
        },
        message,
      );
    } catch (error) {
      console.log('bet error', error);
    }
  }
}
