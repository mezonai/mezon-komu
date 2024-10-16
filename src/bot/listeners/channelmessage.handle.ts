import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Events,
  ChannelMessage,
  MezonClient,
  ChannelStreamMode,
} from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import { Asterisk } from '../asterisk-commands/asterisk';
import { Repository } from 'typeorm';
import { checkTimeMention } from '../utils/helper';
import {
  Channel,
  ChannelMezon,
  Mentioned,
  MentionedPmConfirm,
  Msg,
  Quiz,
  User,
  UserQuiz,
} from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { BOT_ID, EMessageMode } from '../constants/configs';
import { AxiosClientService } from '../services/axiosClient.services';
import { ApiUrl } from '../constants/api_url';
import {
  refGenerate,
  replyMessageGenerate,
} from '../utils/generateReplyMessage';
import { ClientConfigService } from '../config/client-config.service';
import { checkAnswerFormat } from '../utils/helper';
import { QuizService } from '../services/quiz.services';
import { MessageQueue } from '../services/messageQueue.service';

@Injectable()
export class EventListenerChannelMessage {
  private client: MezonClient;
  constructor(
    private clientService: MezonClientService,
    private asteriskCommand: Asterisk,
    @InjectRepository(Mentioned)
    private mentionedRepository: Repository<Mentioned>,
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(Msg) private msgRepository: Repository<Msg>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(MentionedPmConfirm)
    private mentionPmConfirm: Repository<MentionedPmConfirm>,
    @InjectRepository(UserQuiz)
    private userQuizRepository: Repository<UserQuiz>,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    private readonly axiosClientService: AxiosClientService,
    private clientConfigService: ClientConfigService,
    private quizService: QuizService,
    private messageQueue: MessageQueue,
  ) {
    this.client = clientService.getClient();
  }

  @OnEvent(Events.ChannelMessage)
  async handleMentioned(message: ChannelMessage) {
    try {
      const findChannel = await this.channelRepository.findOne({
        where: { channel_id: message.channel_id },
      });

      if (
        message.sender_id === this.clientConfigService.botKomuId ||
        message.sender_id === '0' ||
        !findChannel
      )
        return;
      await Promise.all([
        this.userRepository
          .createQueryBuilder()
          .update(User)
          .set({ last_message_id: message.message_id })
          .where('"userId" = :userId', { userId: message.sender_id })
          .andWhere(`deactive IS NOT True`)
          .execute(),
        this.mentionedRepository
          .createQueryBuilder()
          .update(Mentioned)
          .set({ confirm: true, reactionTimestamp: Date.now() })
          .where(`"channelId" = :channelId`, { channelId: message.channel_id })
          .andWhere(`"mentionUserId" = :mentionUserId`, {
            mentionUserId: message.sender_id,
          })
          .andWhere(`"confirm" = :confirm`, { confirm: false })
          .andWhere(`"reactionTimestamp" IS NULL`)
          .execute(),
      ]);

      if (
        !message.content ||
        typeof message.content.t !== 'string' ||
        message.mode === 4 ||
        message.content.t.split(' ').includes('@here')
      )
        return;

      const checkCategoriesId: string[] = [
        '1828296911740735488', // MEZON
        '1779484504386179072', // PROJECTS
        '1828297325110366208', // PRODUCTS
        '1832960022313701376', // LOREN
        '1833343309028790272', // HRM&IT
        '1780077650828595200', // MANAGEMENT
        '1833336406043267072', // PRJ-EU
        '1833335148804837376', // prj-jp
        '1833335520520835072', // prj-uk
        '1833335458617102336', // prj-apac
      ];

      const validCategory: boolean = checkCategoriesId.includes(
        findChannel?.category_id,
      );

      if (!checkTimeMention(new Date())) return;
      if (
        Array.isArray(message.mentions) &&
        message.mentions.length &&
        validCategory
      ) {
        message.mentions.forEach(async (user) => {
          if (
            user?.user_id === this.clientConfigService.botKomuId ||
            user?.role_id
          )
            return;
          const data = {
            messageId: message.message_id,
            authorId: message.sender_id,
            channelId: message.channel_id,
            mentionUserId: user.user_id,
            createdTimestamp: new Date(message.create_time).getTime(),
            noti: false,
            confirm: false,
            punish: false,
            reactionTimestamp: null,
          };
          await this.mentionedRepository.insert(data);
        });
      }
    } catch (error) {
      console.log(error);
    }
  }

  @OnEvent(Events.ChannelMessage)
  async handleCommand(msg: ChannelMessage) {
    if (msg.code) return; // Do not support case edit message
    try {
      const content = msg.content.t;
      let replyMessage: ReplyMezonMessage;
      if (typeof content == 'string' && content.trim()) {
        const firstLetter = content.trim()[0];
        switch (firstLetter) {
          case '*':
            replyMessage = await this.asteriskCommand.execute(content, msg);
            break;
          default:
            return;
          // console.log(msg);
        }

        if (replyMessage) {
          const replyMessageArray = Array.isArray(replyMessage)
            ? replyMessage
            : [replyMessage];
          for (const mess of replyMessageArray) {
            this.messageQueue.addMessage({ ...mess, sender_id: msg.sender_id }); // add to queue, send every 0.2s
            // await this.clientService.sendMessage(mess);
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  @OnEvent(Events.ChannelMessage)
  async handleAIforbot(msg: ChannelMessage) {
    if (msg.channel_id === this.clientConfigService.machleoChannelId) return;
    try {
      const mentions = Array.isArray(msg.mentions) ? msg.mentions : [];
      const message = msg.content.t;
      const refs = Array.isArray(msg.references) ? msg.references : [];
      if (
        (msg.mode === ChannelStreamMode.STREAM_MODE_DM ||
          mentions?.some((obj) => obj.user_id === BOT_ID) ||
          refs?.some((obj) => obj.message_sender_id === BOT_ID)) &&
        typeof message == 'string' &&
        msg.sender_id !== BOT_ID &&
        message.length > 10
      ) {
        const url = ApiUrl.AIApi;
        let AIReplyMessage;
        AIReplyMessage = `Very busy, too much work today. I'm so tired. BRB.`;

        try {
          const response = await this.axiosClientService.post(url, {
            text: message,
          });
          if (response.status == 200) {
            AIReplyMessage = response.data.Response;
          } else {
            throw Error('swtich AI API');
          }
        } catch (e) {
          // const baseUrl = 'https://api.aimlapi.com/v1';
          // const apiKey = process.env.FREE_API_KEY;
          // const systemPrompt =
          //   'bạn là một công cụ ảo được hỗ trợ của công ty công nghệ có hơn 200 nhân viên tên là KOMU. hãy trả lời bằng tiếng việt nhé. Hiện tại trợ lý ảo của công ty đang ra ngoài có chút việc nên bạn sẽ giúp bạn ấy trả lời các câu hỏi khi bạn ấy vắng mặt';
          // const headers = {
          //   Authorization: `Bearer ${apiKey}`,
          //   'Content-Type': 'application/json',
          // };
          // const response = await this.axiosClientService.post(
          //   `${baseUrl}/chat/completions`,
          //   {
          //     model: 'mistralai/Mistral-7B-Instruct-v0.2',
          //     messages: [
          //       { role: 'system', content: systemPrompt },
          //       { role: 'user', content: message },
          //     ],
          //   },
          //   { headers },
          // );
          // const completion = response.data;
          // AIReplyMessage = completion.choices[0].message.content;
        }

        const replyMessage = replyMessageGenerate(
          { messageContent: AIReplyMessage, mentions: [] },
          msg,
        );
        this.messageQueue.addMessage(replyMessage);
        // await this.clientService.sendMessage(replyMessage);
      }
    } catch (e) {
      console.log(e);
    }
  }

  @OnEvent(Events.ChannelMessage)
  async insertPmConfirmWFT(message: ChannelMessage) {
    if (!message.content || typeof message.content.t !== 'string') return;
    if (
      message.content.t.includes('[CONFIRM WFH]') &&
      message.mode === EMessageMode.DM_MESSAGE &&
      message.sender_id === this.clientConfigService.botKomuId
    ) {
      const wfhId = +message.content.t.match(/ID:(\d+)/)[1];
      const dataMentionPmConfirm = {
        messageId: message.message_id,
        wfhId,
        confirm: false,
        value: '',
      };
      await this.mentionPmConfirm.insert(dataMentionPmConfirm);
    }
  }

  @OnEvent(Events.ChannelMessage)
  async handleAnswerBotQuiz(msg: ChannelMessage) {
    if (msg.mode == EMessageMode.DM_MESSAGE && msg.sender_id !== BOT_ID) {
      const query = this.userQuizRepository
        .createQueryBuilder()
        .where('"channel_id" = :channel_id', {
          channel_id: msg.channel_id,
        })
        .select('*');
      if (
        msg.references &&
        Array.isArray(msg.references) &&
        msg.references.length > 0
      ) {
        query.andWhere('"message_id" = :mess_id', {
          mess_id: msg.references[0].message_ref_id,
        });
        const userQuiz = await query.getRawOne();
        if (userQuiz && userQuiz?.['userId']) {
          let mess = '';
          const messOptions = {};
          if (userQuiz['answer']) {
            mess = `Bạn đã trả lời câu hỏi này rồi`;
          } else {
            const question = await this.quizRepository
              .createQueryBuilder()
              .where('id = :quizId', { quizId: userQuiz['quizId'] })
              .select('*')
              .getRawOne();
            if (question) {
              const answer = msg.content.t;
              if (!checkAnswerFormat(answer, question['options'].length)) {
                mess = `Bạn vui lòng trả lời đúng số thứ tự các đáp án câu hỏi`;
              } else {
                if (Number(answer) === Number(question['correct'])) {
                  const newUser = await this.quizService.addScores(
                    userQuiz['userId'],
                  );
                  if (!newUser) return;
                  mess = `Correct!!!, you have ${newUser[0].scores_quiz} points`;
                  await this.quizService.saveQuestionCorrect(
                    userQuiz['userId'],
                    userQuiz['quizId'],
                    Number(answer),
                  );
                } else {
                  mess = `Incorrect!!!, The correct answer is ${question['correct']}`;
                  await this.quizService.saveQuestionInCorrect(
                    userQuiz['userId'],
                    userQuiz['quizId'],
                    Number(answer),
                  );
                }

                mess = `${mess}\nClick on the following link if you want to complain `;
                const link = `https://quiz.nccsoft.vn/question/update/${userQuiz['quizId']}`;
                messOptions['lk'] = [
                  {
                    s: mess.length,
                    e: mess.length + link.length,
                  },
                ];
                mess = mess + link;
              }
            }
          }
          const messageToUser: ReplyMezonMessage = {
            userId: msg.sender_id,
            textContent: mess,
            messOptions: messOptions,
            attachments: [],
            refs: refGenerate(msg),
          };
          this.messageQueue.addMessage(messageToUser);
        }
      }
      const userQuiz = await query.getRawOne();
      await this.userRepository.update(
        { userId: userQuiz['userId'] as string },
        {
          botPing: false,
        },
      );
    }
  }
}
