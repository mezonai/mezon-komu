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
import { IsNull, Repository } from 'typeorm';
import { checkTimeMention } from '../utils/helper';
import {
  Channel,
  ChannelMezon,
  Mentioned,
  Msg,
  Quiz,
  User,
  UserQuiz,
} from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { BOT_ID, EMessageMode, EUserType } from '../constants/configs';
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
import { UtilsService } from '../services/utils.services';
import { invalidCharacter, messagesBusy } from '../constants/text';

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
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(UserQuiz)
    private userQuizRepository: Repository<UserQuiz>,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    private readonly axiosClientService: AxiosClientService,
    private clientConfigService: ClientConfigService,
    private quizService: QuizService,
    private messageQueue: MessageQueue,
    private utilsService: UtilsService,
  ) {
    this.client = clientService.getClient();
  }

  getRandomMessage(): string {
    const randomIndex = Math.floor(Math.random() * messagesBusy.length);
    return messagesBusy[randomIndex];
  }

  async isWebhookUser(message: ChannelMessage) {
    const webhook = await this.userRepository.find({
      where: { roles: IsNull(), user_type: EUserType.MEZON },
    });
    const webhookId = webhook.map((item) => item.userId);
    return webhookId.includes(message.sender_id);
  }

  findUniqueElements(arr1, arr2) {
    const uniqueInArr1 = arr1.filter((item) => !arr2.includes(item)) || [];
    const uniqueInArr2 = arr2.filter((item) => !arr1.includes(item)) || [];
    return { uniqueInArr1, uniqueInArr2 };
  }

  @OnEvent(Events.ChannelMessage)
  async handleMentioned(message: ChannelMessage) {
    try {
      const client = await this.userRepository
        .createQueryBuilder('user')
        .where('(:role = ANY(user.roles) AND user.user_type = :userType)', {
          role: '1832750986804858880',
          userType: EUserType.MEZON,
        })
        .orWhere('user.deactive IS TRUE')
        .getMany();
      const clientId = client.map((item) => item.userId);
      const findChannel = await this.channelRepository.findOne({
        where: { channel_id: message.channel_id },
      });

      if (
        message.sender_id === this.clientConfigService.botKomuId ||
        message.sender_id === '0' ||
        !findChannel ||
        invalidCharacter.includes(message?.content?.t)
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
        (await this.isWebhookUser(message)) ||
        (await this.utilsService.checkHoliday())
      )
        return;

      if (
        (!message.content ||
          typeof message.content.t !== 'string' ||
          message.mode === 4 ||
          message.content.t?.split(' ')?.includes('@here')) &&
        message.code !== 2
      )
        return;

      const checkCategoriesId: string[] = [
        '1779484504386179072', // PROJECTS
        '1833102872493953024', // PRODUCTS
        '1832960022313701376', // LOREN
        '1833343309028790272', // HRM&IT
        '1780077650828595200', // MANAGEMENT
        '1833336406043267072', // PRJ-EU
        '1833335148804837376', // prj-jp
        '1833335520520835072', // prj-uk
        '1833335458617102336', // prj-apac
      ];

      if (!checkTimeMention(new Date())) return;
      if (Array.isArray(message.mentions) && message.mentions.length) {
        let validCategory: boolean = checkCategoriesId.includes(
          findChannel?.category_id,
        );
        if (!findChannel.category_id) {
          const findChannelParent = await this.channelRepository.findOne({
            where: { channel_id: findChannel.parent_id },
          });
          validCategory = checkCategoriesId.includes(
            findChannelParent?.category_id,
          );
        }

        if (!validCategory) return;

        message.mentions.forEach(async (user) => {
          if (
            user?.user_id === this.clientConfigService.botKomuId ||
            clientId.includes(user?.user_id) ||
            user?.role_id ||
            message.code
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

      if (message.code) {
        const listMentionByMessageId = await this.mentionedRepository.find({
          where: {
            messageId: message.message_id,
            channelId: message.channel_id,
            confirm: false,
            reactionTimestamp: null,
          },
        });
        const listMentionConfirmedByMessageId =
          await this.mentionedRepository.find({
            where: {
              messageId: message.message_id,
              channelId: message.channel_id,
              confirm: true,
              reactionTimestamp: null,
            },
          });
        const currentMentionUserIds = listMentionByMessageId.map(
          (user) => user.mentionUserId,
        );
        const currentMentionConfirmedUserIds =
          listMentionConfirmedByMessageId.map((user) => user.mentionUserId);
        const messageMentionUserIds = message.mentions.map(
          (user) => user.user_id,
        );
        if (message.code === 1) {
          const { uniqueInArr1: usersRemoved, uniqueInArr2: usersAdded } =
            this.findUniqueElements(
              currentMentionUserIds,
              messageMentionUserIds,
            );

          usersRemoved.forEach(async (id) => {
            await this.mentionedRepository.update(
              {
                channelId: message.channel_id,
                messageId: message.message_id,
                mentionUserId: id,
              },
              {
                confirm: true,
                reactionTimestamp: new Date(message.create_time).getTime(),
              },
            );
          });

          usersAdded.forEach(async (id) => {
            if (currentMentionConfirmedUserIds.includes(id)) return;
            const findMention = await this.mentionedRepository.find({
              where: {
                messageId: message.message_id,
                mentionUserId: id,
                channelId: message.channel_id,
              },
            });
            if (findMention.length) {
              const userIdsMention = findMention.map(
                (user) => user.mentionUserId,
              );
              userIdsMention.forEach(async (id) => {
                await this.mentionedRepository.update(
                  {
                    channelId: message.channel_id,
                    messageId: message.message_id,
                    mentionUserId: id,
                  },
                  {
                    confirm: false,
                    reactionTimestamp: null,
                  },
                );
              });
              return;
            }
            const data = {
              messageId: message.message_id,
              authorId: message.sender_id,
              channelId: message.channel_id,
              mentionUserId: id,
              createdTimestamp: new Date(message.create_time).getTime(),
              noti: false,
              confirm: false,
              punish: false,
              reactionTimestamp: null,
            };
            await this.mentionedRepository.insert(data);
          });
          return;
        }

        if (message.code === 2) {
          currentMentionUserIds.forEach(async (id) => {
            await this.mentionedRepository.update(
              {
                channelId: message.channel_id,
                messageId: message.message_id,
                mentionUserId: id,
              },
              {
                confirm: true,
                reactionTimestamp: new Date(message.create_time).getTime(),
              },
            );
          });
          return;
        }
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
            this.messageQueue.addMessage({
              ...mess,
              sender_id: msg.sender_id,
              message_id: msg.message_id,
            });
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  // @OnEvent(Events.ChannelMessage)
  async handleAIforbot(msg: ChannelMessage) {
    if (
      msg.channel_id === this.clientConfigService.machleoChannelId ||
      msg.code
    )
      return;
    try {
      const mentions = Array.isArray(msg.mentions) ? msg.mentions : [];
      const message = msg?.content?.t?.replace('@KOMU', 'bạn');
      const refs = Array.isArray(msg.references) ? msg.references : [];
      if (
        (msg.mode === ChannelStreamMode.STREAM_MODE_DM ||
          mentions?.some((obj) => obj.user_id === BOT_ID) ||
          refs?.some((obj) => obj.message_sender_id === BOT_ID)) &&
        typeof message == 'string' &&
        msg.sender_id !== BOT_ID
      ) {
        const url = ApiUrl.AIApi;
        let AIReplyMessage;
        AIReplyMessage = this.getRandomMessage();

        try {
          const response = await this.axiosClientService.post(url, {
            text: message,
          });
          if (response.status == 200) {
            AIReplyMessage = response.data.Response;
          } else {
            throw Error('swtich AI API');
          }
        } catch (e) {}

        const replyMessage = replyMessageGenerate(
          { messageContent: AIReplyMessage, mentions: [] },
          msg,
        );
        this.messageQueue.addMessage(replyMessage);
      }
    } catch (e) {
      console.log(e);
    }
  }

  @OnEvent(Events.ChannelMessage)
  async handleAnswerBotQuiz(msg: ChannelMessage) {
    if (msg.code) return;
    try {
      if (msg.mode == EMessageMode.DM_MESSAGE && msg.sender_id !== BOT_ID) {
        await this.userRepository.update(
          { userId: msg.sender_id },
          {
            botPing: false,
          },
        );
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
                  const correctAnser =
                    Number(answer) === Number(question['correct']);
                  if (correctAnser) {
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
                  const link = `https://quiz.nccsoft.vn/question/update/${userQuiz['quizId']}`;
                  messOptions['embed'] = [
                    {
                      color: `${correctAnser ? '#1E9F2E' : '#ff0101'}`,
                      title: `${mess}`,
                    },
                    {
                      color: `${'#ff0101'}`,
                      title: `Complain`,
                      url: link,
                    },
                  ];
                }
              }
            }
            const messageToUser: ReplyMezonMessage = {
              userId: msg.sender_id,
              textContent: userQuiz['answer'] ? mess : '',
              messOptions: messOptions,
              attachments: [],
              refs: refGenerate(msg),
            };
            this.messageQueue.addMessage(messageToUser);
          }
        }
        await this.userRepository.update(
          { userId: msg.sender_id },
          {
            botPing: false,
          },
        );
      }
    } catch (error) {
      console.log('answer bot error', error, msg);
    }
  }
}
