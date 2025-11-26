/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import {
  ChannelMessage,
  EButtonMessageStyle,
  EMarkdownType,
  Events,
} from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import {
  EmbebButtonType,
  EmbedProps,
  EMessageComponentType,
  EMessageMode,
  EPMButtonTaskW2,
  EPMRequestAbsenceDay,
  EPMTaskW2Type,
  ERequestAbsenceDateType,
  ERequestAbsenceDayStatus,
  ERequestAbsenceDayType,
  ERequestAbsenceTime,
  ERequestAbsenceType,
  EUnlockTimeSheet,
  EUnlockTimeSheetPayment,
  EUserType,
  FFmpegImagePath,
  FileType,
  MEZON_EMBED_FOOTER,
  TransferType,
  UserType,
  VoucherExchangeType,
} from '../constants/configs';
import { MessageQueue } from '../services/messageQueue.service';
import {
  Daily,
  InterviewerReply,
  MenuOrderMessage,
  MezonBotMessage,
  Quiz,
  RoleMezon,
  UnlockTimeSheet,
  User,
  UserQuiz,
  W2Request,
} from '../models';
import { AbsenceDayRequest } from '../models';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReplyMezonMessage } from '../asterisk-commands/dto/replyMessage.dto';
import {
  changeDateFormat,
  checkAnswerFormat,
  createReplyMessage,
  generateEmail,
  generateQRCode,
  getRandomColor,
  getUserNameByEmail,
  getWeekDays,
  sleep,
} from '../utils/helper';
import { QuizService } from '../services/quiz.services';
import { refGenerate } from '../utils/generateReplyMessage';
import { MusicService } from '../services/music.services';
import { FFmpegService } from '../services/ffmpeg.service';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { TimeSheetService } from '../services/timesheet.services';
import {
  checkTimeNotWFH,
  checkTimeSheet,
} from '../asterisk-commands/commands/daily/daily.functions';
import { AxiosClientService } from '../services/axiosClient.services';
import { ClientConfigService } from '../config/client-config.service';
import {
  handleBodyRequestAbsenceDay,
  validateAbsenceTime,
  validateAbsenceTypeDay,
  validateAndFormatDate,
  validateHourAbsenceDay,
  validateTypeAbsenceDay,
  validReasonAbsenceDay,
} from '../utils/request-helper';
import { OnEvent } from '@nestjs/event-emitter';
const https = require('https');
import axios from 'axios';
import { PollService } from '../services/poll.service';
import { MenuOrderService } from '../services/menuOrder.services';

@Injectable()
export class MessageButtonClickedEvent extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    private messageQueue: MessageQueue,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(UserQuiz)
    private userQuizRepository: Repository<UserQuiz>,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    private quizService: QuizService,
    @InjectRepository(UnlockTimeSheet)
    private unlockTimeSheetRepository: Repository<UnlockTimeSheet>,
    private musicService: MusicService,
    private ffmpegService: FFmpegService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,

    private timeSheetService: TimeSheetService,
    @InjectRepository(User)
    private dailyRepository: Repository<Daily>,
    @InjectRepository(AbsenceDayRequest)
    private absenceDayRequestRepository: Repository<AbsenceDayRequest>,
    private axiosClientService: AxiosClientService,
    private clientConfigService: ClientConfigService,
    @InjectRepository(W2Request)
    private w2RequestsRepository: Repository<W2Request>,
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    private pollService: PollService,
    private clientServices: MezonClientService,
    @InjectRepository(InterviewerReply)
    private interviewRepository: Repository<InterviewerReply>,
    @InjectRepository(RoleMezon)
    private roleMezonRepository: Repository<RoleMezon>,
    private menuOrderService: MenuOrderService,
  ) {
    super(clientService);
  }
  private blockEditedList: string[] = [];
  private errorMessageIdByUserDaily = new Map<string, string[]>();

  @OnEvent(Events.MessageButtonClicked)
  async hanndleButtonForm(data) {
    try {
      const args = data.button_id.split('_');
      const buttonConfirmType = args[0];
      switch (buttonConfirmType) {
        case 'pollCreate':
          this.handleCreatePoll(data);
          break;
        case 'question':
          this.handleAnswerQuestionWFH(data);
          break;
        case 'unlockTs':
          this.handleUnlockTimesheet(data);
          break;
        case ERequestAbsenceDayType.REMOTE:
        case ERequestAbsenceDayType.ONSITE:
        case ERequestAbsenceDayType.OFF:
        case ERequestAbsenceDayType.OFFCUSTOM:
          this.handleRequestAbsenceDay(data);
          break;
        case 'daily':
          this.handleSubmitDaily(data);
          break;
        case 'logts':
          this.handleLogTimesheet(data);
          break;
        case 'w2request':
          this.handleEventRequestW2(data);
          break;
        case EPMButtonTaskW2.APPROVE_TASK:
        case EPMButtonTaskW2.REJECT_TASK:
        case EPMButtonTaskW2.SUBMIT_REJECT_TASK:
        case EPMButtonTaskW2.CONFIRM_PROBATIONARY:
        case EPMButtonTaskW2.COMFIRM_REGISNATION:
          this.handleTaskW2Request(data);
          break;
        case 'PMRequestDay':
          this.handlePMRequestAbsenceDay(data);
          break;
        case 'dailyPm':
          this.handleSubmitDailyPm(data);
          break;
        case 'voucher':
          this.handleSelectVoucher(data);
          break;
        case 'poll':
          this.handleSelectPoll(data);
          break;
        case 'interview':
          this.sendAnswerOfInterviewerToHr(data);
          break;
        case 'menu':
          this.menuOrderService.handelSelectMenuOrder(data);
          break;
        default:
          break;
      }
    } catch (error) {
      console.log('hanndleButtonForm ERROR', error);
    }
  }

  async handleAnswerQuestionWFH(data) {
    try {
      const args = data.button_id.split('_');
      if (args[0] !== 'question') return;
      const clan = this.client.clans.get('0');
      const user = await clan.users.fetch(data.user_id);
      const answer = args[1];
      const channelDmId = user.dmChannelId;
      const color = args[3] || '#57F287';
      await this.userRepository.update(
        { userId: data.user_id },
        {
          botPing: false,
        },
      );
      const userQuiz = await this.userQuizRepository
        .createQueryBuilder()
        .where('"channel_id" = :channel_id', {
          channel_id: channelDmId,
        })
        .andWhere('"message_id" = :mess_id', {
          mess_id: data.message_id,
        })
        .select('*')
        .getRawOne();
      let mess = '';
      const question = await this.quizRepository
        .createQueryBuilder()
        .where('id = :quizId', { quizId: userQuiz?.['quizId'] })
        .select('*')
        .getRawOne();
      const messOptions = {};
      if (userQuiz?.['answer']) {
        mess = `Bạn đã trả lời câu hỏi này rồi`;
      } else {
        if (question) {
          if (!checkAnswerFormat(answer, question['options'].length)) {
            mess = `Bạn vui lòng trả lời đúng số thứ tự các đáp án câu hỏi`;
          } else {
            const correctAnser = Number(answer) === Number(question['correct']);
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
      const KOMU = await this.userRepository.findOne({
        where: { userId: process.env.BOT_KOMU_ID },
      });
      const msg: ChannelMessage = {
        message_id: data.message_id,
        id: '',
        channel_id: channelDmId,
        channel_label: '',
        code: EMessageMode.DM_MESSAGE,
        create_time: '',
        sender_id: process.env.BOT_KOMU_ID,
        username: KOMU.username || 'KOMU',
        avatar: KOMU.avatar,
        content: { t: '' },
        attachments: [{}],
      };
      const messageToUser: ReplyMezonMessage = {
        userId: data.user_id,
        textContent: userQuiz?.['answer'] ? mess : '',
        messOptions: messOptions,
        attachments: [],
        refs: refGenerate(msg),
      };
      const title = question.topic
        ? `[${question.topic.toUpperCase()}] ${question.title}`
        : question.title;
      const embed = [
        {
          color: color,
          title: `${title}`,
          description:
            '```' +
            `${question.options
              .map((otp, index) => {
                return `${index + 1} - ${otp}`;
              })
              .join('\n')}` +
            '' +
            '```' +
            '\n(Câu hỏi đã được trả lời)',
        },
      ];
      const channel = await this.client.channels.fetch(channelDmId);
      const message = await channel.messages.fetch(data.message_id);
      await message.update({ embed });
      this.messageQueue.addMessage(messageToUser);
    } catch (error) {
      await this.userRepository.update(
        { userId: data.user_id },
        {
          botPing: false,
        },
      );
      const clan = this.client.clans.get('0');
      const user = await clan.users.fetch(data.user_id);
      await user.sendDM({
        t: 'Có lỗi xảy ra khi trả lời câu hỏi. Bạn được tính là đã trả lời câu hỏi này!',
      });
      console.log('Error handleMessageButtonClicked', error);
    }
  }

  async handleUnlockTimesheet(data) {
    try {
      const args = data.button_id.split('_');
      const typeButtonRes = args[1]; // (confirm or cancel)
      const findUnlockTsData = await this.unlockTimeSheetRepository.findOne({
        where: { messageId: data.message_id, channelId: data.channel_id },
      });
      if (findUnlockTsData?.userId !== data.user_id) return; // check auth
      const replyMessage: ReplyMezonMessage = {
        clan_id: findUnlockTsData.clanId,
        channel_id: findUnlockTsData.channelId,
        is_public: findUnlockTsData.isChannelPublic,
        mode: findUnlockTsData.modeMessage,
        msg: {
          t: '',
        },
      };

      // handle cancel
      if (typeButtonRes === EUnlockTimeSheet.CANCEL) {
        const messageContentDefault =
          'The unlock timesheet has been cancelled!';
        replyMessage['msg'] = {
          t: messageContentDefault,
          mk: [
            {
              type: EMarkdownType.PRE,
              s: 0,
              e: messageContentDefault.length,
            },
          ],
        };
        // update status active
        await this.unlockTimeSheetRepository.update(
          { id: findUnlockTsData.id },
          {
            status: EUnlockTimeSheet.CANCEL,
          },
        );
        const channel = await this.client.channels.fetch(
          replyMessage.channel_id,
        );
        const message = await channel.messages.fetch(data.message_id);
        await message.update(replyMessage.msg);
        return;
      }
      if (args[0] !== 'unlockTs' || !data?.extra_data || !findUnlockTsData)
        return;
      const dataParse = JSON.parse(data.extra_data);
      const value = dataParse?.RADIO?.split('_')[1]; // (pm or staff)
      //init reply message

      // only process with no status (not confirm or cancel request yet)
      if (!findUnlockTsData.status) {
        // check user press button confirm or cancel
        switch (typeButtonRes) {
          case EUnlockTimeSheet.CONFIRM:
            // data for QR code
            const sendTokenData = {
              sender_id: data.user_id,
              receiver_id: process.env.BOT_KOMU_ID,
              receiver_name: 'KOMU',
              amount:
                value === EUnlockTimeSheet.PM
                  ? EUnlockTimeSheetPayment.PM_PAYMENT
                  : EUnlockTimeSheetPayment.STAFF_PAYMENT, // check pm or staff to get payment value
              note: `[UNLOCKTS - ${findUnlockTsData.id}]`,
              extra_attribute: JSON.stringify({
                type: TransferType.UNLOCKTS,
              }),
            };
            // update status active
            await this.unlockTimeSheetRepository.update(
              { id: findUnlockTsData.id },
              {
                amount: sendTokenData.amount,
                status: EUnlockTimeSheet.CONFIRM,
              },
            );

            // gen QR code
            const qrCodeImage = await generateQRCode(
              JSON.stringify(sendTokenData),
            );
            //
            const channelDM = await this.channelDmMezonRepository.findOne({
              where: { user_id: findUnlockTsData.userId },
            });

            // send QR code to user
            const embed: EmbedProps[] = [
              {
                color: getRandomColor(),
                title: `Click HERE`,
                url: `https://mezon.ai/chat/direct/message/${channelDM?.channel_id}/3?openPopup=true&token=${sendTokenData.amount}&userId=${sendTokenData.receiver_id}&note=${sendTokenData.note}`,
                fields: [
                  {
                    name: 'Or scan this QR code for UNLOCK TIMESHEET!',
                    value: '',
                  },
                ],
                image: {
                  url: qrCodeImage + '',
                  width: '300px',
                  height: '300px',
                },
                timestamp: new Date().toISOString(),
                footer: MEZON_EMBED_FOOTER,
              },
            ];
            const messageToUser: ReplyMezonMessage = {
              userId: data.user_id,
              textContent: '',
              messOptions: { embed },
            };
            this.messageQueue.addMessage(messageToUser);
            const messageContent =
              'Transaction pending! KOMU was sent to you a message, please check!';
            replyMessage['msg'] = {
              t: messageContent,
              mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
            };
            break;
          default:
            break;
        }
      } else {
        const messageContent =
          '' +
          `This request has been ${findUnlockTsData.status.toLowerCase()}ed!` +
          '';
        replyMessage['msg'] = {
          t: messageContent,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: messageContent.length }],
        };
      }
      const channel = await this.client.channels.fetch(replyMessage.channel_id);
      const message = await channel.messages.fetch(data.message_id);
      await message.update(replyMessage.msg);
    } catch (e) {
      console.log('handleUnlockTimesheet', e);
    }
  }

  private async clearErrorsForUser(userId: string, channel_id: string) {
    const list = this.errorMessageIdByUserDaily.get(userId);
    if (!list || !list.length) return;
    const channel = await this.client.channels.fetch(channel_id);
    await Promise.all(
      list.map(async (msgId) => {
        const message = await channel.messages.fetch(msgId);
        await message.delete();
      }),
    );

    this.errorMessageIdByUserDaily.delete(userId);
  }

  async handleSubmitDaily(data) {
    const senderId = data.user_id;
    const botId = data.sender_id;
    const channelId = data.channel_id;
    const splitButtonId = data.button_id.split('_');
    const messid = splitButtonId[1];
    const clanIdValue = splitButtonId[2];
    const modeValue = splitButtonId[3];
    const codeMessValue = splitButtonId[4];
    const isPublicValue = splitButtonId[5] === 'false' ? false : true;
    const ownerSenderDaily = splitButtonId[6];
    const dateValue = splitButtonId[7];
    const buttonType = splitButtonId[8];
    const authorMessageId = splitButtonId[9];
    const channel = await this.client.channels.fetch(channelId);
    const messageAuthor = await channel.messages.fetch(authorMessageId);

    const invalidLength =
      '❌Please enter at least 100 characters in your daily text';
    const missingField =
      '❌Missing project, yesterday, today, block or task field';

    const isOwner = ownerSenderDaily === senderId;
    if (!isOwner) return;
    //init reply message
    const getBotInformation = await this.userRepository.findOne({
      where: { userId: botId },
    });

    const msg: ChannelMessage = {
      message_id: data.message_id,
      id: '',
      channel_id: channelId,
      channel_label: '',
      code: codeMessValue,
      create_time: '',
      sender_id: botId,
      username: getBotInformation.username,
      avatar: getBotInformation.avatar,
      content: { t: '' },
      attachments: [{}],
    };

    const isCancel = buttonType === EUnlockTimeSheet.CANCEL.toLowerCase();
    const isSubmit = buttonType === EUnlockTimeSheet.SUBMIT.toLowerCase();
    try {
      if (!data.extra_data) {
        if (
          (!isOwner && (isCancel || isSubmit)) ||
          (isOwner && (isCancel || isSubmit))
        ) {
          return;
        }
      }
      switch (buttonType) {
        case EUnlockTimeSheet.SUBMIT.toLowerCase():
          let parsedExtraData;
          try {
            parsedExtraData = JSON.parse(data.extra_data);
          } catch (error) {
            throw new Error('Invalid JSON in extra_data');
          }

          const projectKey = `daily-${messid}-project`;
          const yesterdayKey = `daily-${messid}-yesterday-ip`;
          const todayKey = `daily-${messid}-today-ip`;
          const blockKey = `daily-${messid}-block-ip`;
          const workingTimeKey = `daily-${messid}-working-time`;
          const typeOfWorkKey = `daily-${messid}-type-of-work`;
          const taskKey = `daily-${messid}-task`;

          const projectCode = parsedExtraData[projectKey];
          const yesterdayValue = parsedExtraData[yesterdayKey];
          const todayValue = parsedExtraData[todayKey];
          const blockValue = parsedExtraData[blockKey];
          const workingTimeValue = parsedExtraData[workingTimeKey];
          const typeOfWorkValue = parsedExtraData[typeOfWorkKey];
          const taskValue = parsedExtraData[taskKey];

          const isMissingField =
            !projectCode ||
            !yesterdayValue ||
            !todayValue ||
            !blockValue ||
            !taskValue;
          const contentGenerated = `*daily ${projectCode} ${dateValue}\n yesterday:${yesterdayValue}\n today:${todayValue}\n block:${blockValue}`;
          const contentLength =
            yesterdayValue?.length + todayValue?.length + blockValue?.length;

          if (!isOwner) {
            return;
          }

          if (contentLength < 80) {
            const messageInvalidLength = await messageAuthor.reply({
              t: invalidLength,
              mk: [
                {
                  type: EMarkdownType.PRE,
                  s: 0,
                  e: invalidLength.length,
                },
              ],
            });
            if (!messageInvalidLength) return;
            const list = this.errorMessageIdByUserDaily.get(data.user_id) ?? [];
            list.push(messageInvalidLength.message_id);
            this.errorMessageIdByUserDaily.set(data.user_id, list);
            return messageInvalidLength;
          }

          if (isMissingField) {
            const messageMissingField = await messageAuthor.reply({
              t: missingField,
              mk: [
                {
                  type: EMarkdownType.PRE,
                  s: 0,
                  e: missingField.length,
                },
              ],
            });
            if (!messageMissingField) return;
            const list = this.errorMessageIdByUserDaily.get(data.user_id) ?? [];
            list.push(messageMissingField.message_id);
            this.errorMessageIdByUserDaily.set(data.user_id, list);
            return messageMissingField;
          }
          const findUser = await this.userRepository
            .createQueryBuilder()
            .where(`"userId" = :userId`, { userId: senderId })
            .andWhere(`"deactive" IS NOT true`)
            .getOne();

          if (!findUser) return;

          const authorUsername = findUser.clan_nick || findUser.username;
          const emailAddress = generateEmail(authorUsername);

          const wfhResult = await this.timeSheetService.findWFHUser();
          const wfhUserEmail = wfhResult.map((item) =>
            getUserNameByEmail(item.emailAddress),
          );

          await this.saveDaily(
            senderId,
            channelId,
            contentGenerated as string,
            authorUsername,
          );

          await this.timeSheetService.logTimeSheetForTask(
            todayValue,
            emailAddress,
            projectCode,
            typeOfWorkValue,
            taskValue,
            workingTimeValue,
          );
          const isValidTimeFrame = checkTimeSheet();
          const isValidWFH = checkTimeNotWFH();
          const baseMessage = '✅ Daily saved.';
          const errorMessageWFH =
            '❌ Daily saved. (Invalid daily time frame. Please daily at 7h30-9h30, 12h-17h. WFH not daily 20k/time.)';
          const errorMessageNotWFH =
            '❌ Daily saved. (Invalid daily time frame. Please daily at 7h30-17h. not daily 20k/time.)';

          const messageContent = wfhUserEmail.includes(authorUsername)
            ? isValidTimeFrame
              ? baseMessage
              : errorMessageWFH
            : isValidWFH
              ? baseMessage
              : errorMessageNotWFH;

          const textDailySuccess =
            '' +
            messageContent +
            '\n' +
            `Date: ${dateValue}` +
            '\n' +
            `Yesterday: ${yesterdayValue}` +
            '\n' +
            `Today: ${todayValue}` +
            '\n' +
            `Block: ${blockValue}` +
            '\n' +
            `Working time: ${workingTimeValue}h` +
            '';
          const msgDailySuccess = {
            t: textDailySuccess,
            mk: [{ type: EMarkdownType.PRE, s: 0, e: textDailySuccess.length }],
          };
          // delete ephemeral form
          await channel.deleteEphemeral(
            data.user_id,
            data.message_id,
          );
          // delete list messsage error
          await this.clearErrorsForUser(data.user_id, data.channel_id)
          await messageAuthor.reply(msgDailySuccess);
          break;
        case EUnlockTimeSheet.CANCEL.toLowerCase():
          const textDailyCancelSuccess = 'The daily has been cancelled';
          const msgDailyCancelSuccess = {
            t: textDailyCancelSuccess,
            mk: [
              {
                type: EMarkdownType.PRE,
                s: 0,
                e: textDailyCancelSuccess.length,
              },
            ],
          };

          // delete ephemeral form
          await channel.deleteEphemeral(
            data.user_id,
            data.message_id,
          );
          // delete list messsage error
          await this.clearErrorsForUser(data.user_id, data.channel_id)
          await messageAuthor.reply(msgDailyCancelSuccess);
          return;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in handleSubmitDaily:', error.message);
    }
  }

  saveDaily(senderId: string, channelId: string, args: string, email: string) {
    return this.dailyRepository
      .createQueryBuilder()
      .insert()
      .into(Daily)
      .values({
        userid: senderId,
        email: email,
        daily: args,
        createdAt: Date.now(),
        channelid: channelId,
      })
      .execute();
  }
  async handleRequestAbsenceDay(data) {
    const senderId = data.user_id;
    const botId = data.sender_id;
    const channelId = data.channel_id;
    const splitButtonId = data.button_id.split('_');
    const messid = splitButtonId[1];
    const clanIdValue = splitButtonId[2];
    const modeValue = splitButtonId[3];
    const codeMessValue = splitButtonId[4];
    const isPublicValue = splitButtonId[5] === 'false' ? false : true;
    const typeButtonRes = splitButtonId[6]; // (confirm or cancel)

    //init reply message
    const getBotInformation = await this.userRepository.findOne({
      where: { userId: botId },
    });

    const msg: ChannelMessage = {
      message_id: data.message_id,
      id: '',
      channel_id: channelId,
      channel_label: '',
      code: codeMessValue,
      create_time: '',
      sender_id: botId,
      username: getBotInformation.username,
      avatar: getBotInformation.avatar,
      content: { t: '' },
      attachments: [{}],
    };

    try {
      // Parse button_id
      const args = data.button_id.split('_');
      const typeRequest = args[0];
      const typeRequestDayEnum =
        ERequestAbsenceDayType[
          typeRequest as keyof typeof ERequestAbsenceDayType
        ];
      // Find absence data
      const findAbsenceData = await this.absenceDayRequestRepository.findOne({
        where: { messageId: data.message_id, channelId: data.channel_id },
      });
      if (!findAbsenceData) return;

      // Check user authorization
      if (findAbsenceData.userId !== data.user_id) return;

      const dataParse = data.extra_data ? JSON.parse(data.extra_data) : {};

      // Initialize reply message
      const replyMessage: ReplyMezonMessage = {
        clan_id: findAbsenceData.clanId,
        channel_id: findAbsenceData.channelId,
        is_public: findAbsenceData.isChannelPublic,
        mode: findAbsenceData.modeMessage,
        msg: {
          t: '',
        },
      };
      // find emailAddress by senderId
      const findUser = await this.userRepository
        .createQueryBuilder()
        .where(`"userId" = :userId`, { userId: findAbsenceData.userId })
        .andWhere(`"deactive" IS NOT true`)
        .select('*')
        .getRawOne();
      if (!findUser) return;
      const authorUsername = findUser.email;
      const emailAddress = generateEmail(authorUsername);

      // Process only requests without status
      if (!findAbsenceData.status) {
        switch (typeButtonRes) {
          case ERequestAbsenceDayStatus.CONFIRM:
            // Valid input and format
            const validDate = validateAndFormatDate(dataParse.dateAt);
            const validHour = validateHourAbsenceDay(
              dataParse.hour || '0',
              typeRequestDayEnum,
            );
            const validTypeDate = validateTypeAbsenceDay(
              dataParse.dateType ? dataParse.dateType[0] : null,
              typeRequestDayEnum,
            );
            const validReason = validReasonAbsenceDay(
              dataParse.reason,
              typeRequestDayEnum,
            );
            const validAbsenceType = validateAbsenceTypeDay(
              dataParse.absenceType ? dataParse.absenceType[0] : null,
              typeRequestDayEnum,
            );
            const validAbsenceTime = validateAbsenceTime(
              dataParse.absenceTime ? dataParse.absenceTime[0] : null,
              typeRequestDayEnum,
            );
            const userId = findAbsenceData.userId;
            const validations = [
              { valid: validDate.valid, message: validDate.message },
              {
                valid: validAbsenceTime.valid,
                message: validAbsenceTime.message,
              },
              { valid: validHour.valid, message: validHour.message },
              { valid: validTypeDate.valid, message: validTypeDate.message },
              {
                valid: validAbsenceType.valid,
                message: validAbsenceType.message,
              },
              { valid: validReason.valid, message: validReason.message },
            ];
            for (const { valid, message } of validations) {
              if (!valid) {
                const replyMessageInvalidLength = createReplyMessage(
                  `\`\`\`❌ ${message || 'Invalid input'}\`\`\``,
                  clanIdValue,
                  channelId,
                  isPublicValue,
                  modeValue,
                  msg,
                );
                this.messageQueue.addMessage(replyMessageInvalidLength);
                return;
              }
            }

            dataParse.dateAt = validDate?.formattedDate;
            const body = handleBodyRequestAbsenceDay(
              dataParse,
              typeRequest,
              emailAddress,
            );
            let requestId = 0;
            try {
              // Call API request absence day
              const resAbsenceDayRequest =
                await this.timeSheetService.requestAbsenceDay(body);
              if (resAbsenceDayRequest?.data?.success) {
                requestId =
                  resAbsenceDayRequest.data.result.absences[0].requestId;
                const textSuccess = `\`\`\`✅ Request ${typeRequest || 'absence'} successful! \`\`\``;
                const msgSuccess = {
                  t: textSuccess,
                  mk: [
                    { type: EMarkdownType.PRE, s: 0, e: textSuccess.length },
                  ],
                };
                const channel = await this.client.channels.fetch(channelId);
                const message = await channel.messages.fetch(data.message_id);
                await message.update(msgSuccess);
              } else {
                throw new Error('Request failed!');
              }
            } catch (error) {
              const textError = `\`\`\`❌ ${error.response.data.error.message || 'Request absence failed.'}\`\`\``;
              const msgError = {
                t: textError,
                mk: [{ type: EMarkdownType.PRE, s: 0, e: textError.length }],
              };
              const channel = await this.client.channels.fetch(channelId);
              const message = await channel.messages.fetch(data.message_id);
              await message.update(msgError);

              return;
            }
            // Update status to CONFIRM
            await this.absenceDayRequestRepository.update(
              { id: findAbsenceData.id },
              {
                status: ERequestAbsenceDayStatus.CONFIRM,
                reason: body.reason,
                dateType: body.absences[0].dateType,
                absenceTime: body.absences[0].absenceTime,
                requestId: requestId,
              },
            );
            // Send notification to PMs of user
            const dataPms =
              await this.timeSheetService.getPMsOfUser(emailAddress);
            if (dataPms?.data?.success) {
              const resultPms = dataPms.data.result;
              const emails = resultPms
                .filter(
                  (project) => project.projectName !== 'Company Activities',
                )
                .flatMap((project) => project.pMs.map((pm) => pm.emailAddress))
                .filter((email) => email !== null);

              const usernames = emails.map((email) => email.split('@')[0]);
              const users = await this.userRepository.find({
                where: usernames.map((username) => ({
                  username,
                  deactive: false,
                })),
                select: ['userId'],
              });

              const userIdPms = users.map((user) => user.userId);
              const usernameSender = emailAddress.split('@')[0];
              let dateType = ERequestAbsenceDateType[body.absences[0].dateType];
              let hourNumber;
              let dayOffTypeName;
              if (
                body.type === ERequestAbsenceType.OFF &&
                dateType !== ERequestAbsenceDateType[4]
              ) {
                const absenceAllType =
                  await this.timeSheetService.getAllTypeAbsence();
                const dayOffType = absenceAllType.data.result.find(
                  (item) => item.id === body.dayOffTypeId,
                );
                dayOffTypeName = dayOffType.name;
              }
              if (dateType === ERequestAbsenceDateType[4]) {
                if (
                  body.absences[0].absenceTime ===
                  ERequestAbsenceTime.ARRIVE_LATE
                )
                  dateType = 'Đi muộn';
                if (
                  body.absences[0].absenceTime ===
                  ERequestAbsenceTime.LEAVE_EARLY
                )
                  dateType = 'Về sớm';
                hourNumber = body.absences[0].hour.toString() + 'h';
              }
              for (const userIdPm of userIdPms) {
                const embedSendMessageToPm: EmbedProps[] = [
                  {
                    color: '#57F287',
                    title: `${usernameSender} has sent a request ${typeRequest} ${dayOffTypeName || ''}\nfor following dates: ${body.absences[0].dateAt} ${dateType} ${hourNumber || ''}\nReason: ${body.reason}`,
                  },
                ];
                const componentsSendPm = [
                  {
                    components: [
                      {
                        id: `PMRequestDay_REJECT_${requestId}_${usernameSender}_${typeRequest}_${body.absences[0].dateAt}_${dateType}`,
                        type: EMessageComponentType.BUTTON,
                        component: {
                          label: `Reject`,
                          style: EButtonMessageStyle.DANGER,
                        },
                      },
                      {
                        id: `PMRequestDay_APPROVE_${requestId}_${usernameSender}_${typeRequest}_${body.absences[0].dateAt}_${dateType}`,
                        type: EMessageComponentType.BUTTON,
                        component: {
                          label: `Approve`,
                          style: EButtonMessageStyle.SUCCESS,
                        },
                      },
                    ],
                  },
                ];
                const messageToUser: ReplyMezonMessage = {
                  userId: userIdPm,
                  textContent: '',
                  messOptions: {
                    embed: embedSendMessageToPm,
                    components: componentsSendPm,
                  },
                };
                this.messageQueue.addMessage(messageToUser);
              }
            }
            break;
          default:
            const textCancel = `\`\`\`Cancel request ${typeRequest || 'absence'} successful! \`\`\``;
            const msgCancel = {
              t: textCancel,
              mk: [{ type: EMarkdownType.PRE, s: 0, e: textCancel.length }],
            };
            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.messages.fetch(data.message_id);
            await message.update(msgCancel);

            // Update status to CANCEL
            await this.absenceDayRequestRepository.update(
              { id: findAbsenceData.id },
              { status: ERequestAbsenceDayStatus.CANCEL },
            );
            break;
        }
      } else {
        replyMessage['msg'] = {
          t: `This request has been ${findAbsenceData.status}ed!`,
        };
      }
    } catch (e) {
      console.error('handleRequestAbsence', e);
    }
  }
  async handleLogTimesheet(data) {
    const senderId = data.user_id;
    const botId = data.sender_id;
    const channelId = data.channel_id;
    const splitButtonId = data.button_id.split('_');
    const messid = splitButtonId[1];
    const clanIdValue = splitButtonId[2];
    const modeValue = splitButtonId[3];
    const codeMessValue = splitButtonId[4];
    const isPublicValue = splitButtonId[5] === 'false' ? false : true;
    const ownerSenderId = splitButtonId[6];
    const ownerSenderEmail = splitButtonId[7];
    const isLogByWeek = splitButtonId[8] === 'false' ? false : true;
    const buttonType = splitButtonId[9];
    const isOwner = ownerSenderId === senderId;
    const missingFieldMessage = 'Missing some field';
    const logTimesheetByDateSuccess = 'Timesheet Logged Successfully on';
    const logTimesheetByWeekSuccess =
      'Timesheet Logged Successfully for the Week';
    const logTimesheetByDateFail = 'Failed to Log Timesheet';

    //init reply message
    const getBotInformation = await this.userRepository.findOne({
      where: { userId: botId },
    });

    const msg: ChannelMessage = {
      message_id: data.message_id,
      id: '',
      channel_id: channelId,
      channel_label: '',
      code: codeMessValue,
      create_time: '',
      sender_id: botId,
      username: getBotInformation.username,
      avatar: getBotInformation.avatar,
      content: { t: '' },
      attachments: [{}],
    };

    const isCancel = buttonType === EUnlockTimeSheet.CANCEL.toLowerCase();
    const isSubmit = buttonType === EUnlockTimeSheet.SUBMIT.toLowerCase();
    try {
      if (!data.extra_data) {
        if (
          (!isOwner && (isCancel || isSubmit)) ||
          (isOwner && (isCancel || isSubmit))
        ) {
          return;
        }
      }

      switch (buttonType) {
        case EUnlockTimeSheet.SUBMIT.toLowerCase():
          let parsedExtraData;
          try {
            parsedExtraData = JSON.parse(data.extra_data);
          } catch (error) {
            throw new Error('Invalid JSON in extra_data');
          }

          const dateKey = `logts-${messid}-date`;
          const projectKey = `logts-${messid}-project`;
          const taskKey = `logts-${messid}-task`;
          const noteKey = `logts-${messid}-note`;
          const workingTimeKey = `logts-${messid}-working-time`;
          const typeOfWorkKey = `logts-${messid}-type-of-work`;

          const dateValue = parsedExtraData[dateKey];
          const projectId = parsedExtraData[projectKey]?.[0];
          const taskValue = parsedExtraData[taskKey]?.[0];
          const noteValue = parsedExtraData[noteKey];
          const workingTimeValue = parsedExtraData[workingTimeKey] * 60;
          const typeOfWorkValue = parsedExtraData[typeOfWorkKey]?.[0];

          const urlGetTasks = `${process.env.TIMESHEET_API}Mezon/GetProjectsIncludingTasks?emailAddress=${ownerSenderEmail}`;
          const responseTasks = await this.axiosClientService.get(urlGetTasks, {
            headers: {
              securityCode: process.env.SECURITY_CODE,
              accept: 'application/json',
            },
          });
          const taskMetaData = responseTasks?.data?.result;

          const project = taskMetaData.find((item) => item.id === projectId);
          const getTaskByProjectId = taskMetaData.find(
            (p) => p.id === projectId,
          );
          const task = getTaskByProjectId?.tasks?.find(
            (item) => item.projectTaskId === taskValue,
          );
          const taskName = task.taskName;
          const typeOfWork =
            Number(typeOfWorkValue) === 0 ? 'Normal Time' : 'Overtime';

          const isMissingField =
            (!isLogByWeek && !dateValue) ||
            !projectId ||
            !taskValue ||
            !noteValue ||
            !workingTimeValue;

          if (!isOwner) {
            return;
          }

          if (isMissingField) {
            const replyMessageMissingField = createReplyMessage(
              missingFieldMessage,
              clanIdValue,
              channelId,
              isPublicValue,
              modeValue,
              msg,
            );
            return this.messageQueue.addMessage(replyMessageMissingField);
          }

          if (isLogByWeek) {
            const today = new Date();
            const daysOfWeek = getWeekDays(today);
            const mapToPayloadOfWeek = daysOfWeek.map((day) => ({
              dateAt: day,
              projectTaskId: taskValue,
              workingTime: workingTimeValue,
              typeOfWork: typeOfWorkValue,
              note: noteValue,
              emailAddress: ownerSenderEmail,
            }));
            await this.timeSheetService.logTimeSheetByWeek(mapToPayloadOfWeek);

            const textSubmitByWeekSuccess =
              '' +
              logTimesheetByWeekSuccess +
              '\n' +
              `Time: ${changeDateFormat(daysOfWeek[0])} to ${changeDateFormat(daysOfWeek[6])}` +
              '\n' +
              `Project: ${project.projectName}` +
              '\n' +
              `Task: ${taskName}` +
              '\n' +
              `Note: ${noteValue}` +
              '\n' +
              `Working time: ${workingTimeValue / 60}h` +
              '\n' +
              `Type Of Work: ${typeOfWork}` +
              '\n' +
              '';
            const msgSubmitByWeekSuccess = {
              t: textSubmitByWeekSuccess,
              mk: [
                {
                  type: EMarkdownType.PRE,
                  s: 0,
                  e: textSubmitByWeekSuccess.length,
                },
              ],
            };
            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.messages.fetch(data.message_id);
            await message.update(msgSubmitByWeekSuccess);
          } else {
            await this.timeSheetService.logTimeSheetByDate(
              typeOfWorkValue,
              taskValue,
              noteValue,
              null,
              workingTimeValue,
              0,
              projectId,
              dateValue,
              ownerSenderEmail,
            );

            const textSubmitByDateSuccess =
              '' +
              logTimesheetByDateSuccess +
              '\n' +
              `Date: ${changeDateFormat(dateValue)}` +
              '\n' +
              `Project: ${project.projectName}` +
              '\n' +
              `Task: ${taskName}` +
              '\n' +
              `Note: ${noteValue}` +
              '\n' +
              `Working time: ${workingTimeValue / 60}h` +
              '\n' +
              `Type Of Work: ${typeOfWork}` +
              '\n' +
              '';
            const msgSubmitByDateSuccess = {
              t: textSubmitByDateSuccess,
              mk: [
                {
                  type: EMarkdownType.PRE,
                  s: 0,
                  e: textSubmitByDateSuccess.length,
                },
              ],
            };

            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.messages.fetch(data.message_id);
            await message.update(msgSubmitByDateSuccess);
          }

          break;
        case EUnlockTimeSheet.CANCEL.toLowerCase():
          const textLogTsCancelSuccess =
            'The log timesheet has been cancelled!';
          const msgLogtsCancelSuccess = {
            t: textLogTsCancelSuccess,
            mk: [
              {
                type: EMarkdownType.PRE,
                s: 0,
                e: textLogTsCancelSuccess.length,
              },
            ],
          };
          const channel = await this.client.channels.fetch(channelId);
          const message = await channel.messages.fetch(data.message_id);
          await message.update(msgLogtsCancelSuccess);
          return;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in handleLogTimesheet:', error.message);
      const replyMessageSubmit = createReplyMessage(
        logTimesheetByDateFail,
        clanIdValue,
        channelId,
        isPublicValue,
        modeValue,
        msg,
      );
      this.messageQueue.addMessage(replyMessageSubmit);
    }
  }
  private temporaryStorage: Record<string, any> = {};
  async handleEventRequestW2(data) {
    if (data.button_id !== 'w2request_CONFIRM') return;
    const baseUrl = process.env.W2_REQUEST_API_BASE_URL;
    const { message_id, extra_data, button_id } = data;
    if (!message_id || !button_id) return;

    const findW2requestData = await this.w2RequestsRepository.findOne({
      where: { messageId: data.message_id, channelId: data.channel_id },
    });
    const replyMessage: ReplyMezonMessage = {
      clan_id: findW2requestData.clanId,
      channel_id: findW2requestData.channelId,
      is_public: findW2requestData.isChannelPublic,
      mode: findW2requestData.modeMessage,
      msg: {
        t: '',
      },
    };

    if (extra_data === '') {
      replyMessage['msg'] = {
        t: `Missing all data !`,
      };
      this.messageQueue.addMessage(replyMessage);
      return;
    }

    let parsedData;

    try {
      parsedData =
        typeof extra_data === 'string' ? JSON.parse(extra_data) : extra_data;
    } catch (error) {
      replyMessage['msg'] = {
        t: `Invalid JSON format in extra_data`,
      };
      this.messageQueue.addMessage(replyMessage);
      return;
    }

    const storage = this.temporaryStorage[message_id] || {};

    if (!storage.dataInputs) {
      storage.dataInputs = {};
    }

    Object.entries(parsedData?.dataInputs || parsedData).forEach(
      ([key, value]) => {
        if (Array.isArray(value)) {
          storage.dataInputs[key] = value.join(', ');
        } else {
          storage.dataInputs[key] = value;
        }
      },
    );

    this.temporaryStorage[message_id] = storage;

    const existingData = this.temporaryStorage[message_id];

    const additionalData = {
      workflowDefinitionId: findW2requestData.workflowId,
      email: `${findW2requestData.email}@ncc.asia`,
    };

    const completeData = {
      ...additionalData,
      ...existingData,
    };
    let idString = '';
    if (typeof findW2requestData.Id === 'string') {
      idString = findW2requestData.Id;
    } else if (typeof findW2requestData.Id === 'object') {
      idString = JSON.stringify(findW2requestData.Id);
    }
    const arr = idString.replace(/[{}"]/g, '').split(',');
    const missingFields = arr.filter(
      (field) => !completeData?.dataInputs?.[field],
    );

    if (missingFields.length > 0) {
      replyMessage['msg'] = {
        t: `Missing fields : ${missingFields.join(', ')}`,
      };
      this.messageQueue.addMessage(replyMessage);
      return;
    }
    const isValidDateFormat = (dateString) =>
      /^\d{2}\/\d{2}\/\d{4}$/.test(dateString);

    let dateList = [];
    let invalidFormatDates = [];
    let startDate = null;
    let endDate = null;

    if (
      completeData.dataInputs.Dates &&
      typeof completeData.dataInputs.Dates === 'string'
    ) {
      const dateStrings = completeData.dataInputs.Dates.split(',').map((date) =>
        date.trim(),
      );

      invalidFormatDates = dateStrings.filter(
        (date) => !isValidDateFormat(date),
      );

      dateList = dateStrings.filter(isValidDateFormat).map((date) => {
        const [day, month, year] = date.split('/').map(Number);
        return new Date(year, month - 1, day);
      });
    }

    if (
      completeData.dataInputs.StartDate &&
      completeData.dataInputs.EndDate &&
      typeof completeData.dataInputs.StartDate === 'string' &&
      typeof completeData.dataInputs.EndDate === 'string'
    ) {
      const { StartDate, EndDate } = completeData.dataInputs;
      if (!isValidDateFormat(StartDate)) {
        invalidFormatDates.push(`StartDate: ${StartDate}`);
      }
      if (!isValidDateFormat(EndDate)) {
        invalidFormatDates.push(`EndDate: ${EndDate}`);
      }

      if (isValidDateFormat(StartDate)) {
        const [day, month, year] = StartDate.split('/').map(Number);
        startDate = new Date(year, month - 1, day);
        dateList.push(startDate);
      }
      if (isValidDateFormat(EndDate)) {
        const [day, month, year] = EndDate.split('/').map(Number);
        endDate = new Date(year, month - 1, day);
        dateList.push(endDate);
      }

      if (startDate && endDate && endDate < startDate) {
        replyMessage.msg.t = `Invalid range: EndDate (${endDate.toLocaleDateString()}) cannot be earlier than StartDate (${startDate.toLocaleDateString()}).`;
        this.messageQueue.addMessage(replyMessage);
        return;
      }
    }

    if (invalidFormatDates.length > 0) {
      replyMessage.msg.t = `Invalid format dates: ${invalidFormatDates.join(', ')} (must be in dd/MM/yyyy format)`;
      this.messageQueue.addMessage(replyMessage);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateList.length > 0) {
      const invalidDates = dateList.filter((date) => date < today);
      if (invalidDates.length > 0) {
        replyMessage.msg.t = `Invalid dates: ${invalidDates.map((d) => d.toLocaleDateString()).join(', ')} (earlier than today)`;
        this.messageQueue.addMessage(replyMessage);
        return;
      }
    }

    try {
      const textCreateRequestSuccess = 'Create request successfully!';
      const msgCreateSuccess = {
        t: textCreateRequestSuccess,
        mk: [
          {
            type: EMarkdownType.PRE,
            s: 0,
            e: textCreateRequestSuccess.length,
          },
        ],
      };
      const channel = await this.client.channels.fetch(
        findW2requestData.channelId,
      );
      const message = await channel.messages.fetch(data.message_id);
      await message.update(msgCreateSuccess);
      this.messageQueue.addMessage(replyMessage);
      const agent = new https.Agent({
        rejectUnauthorized: false,
      });
      await axios.post(`${baseUrl}/new-instance`, completeData, {
        headers: {
          'x-secret-key': process.env.W2_REQUEST_X_SECRET_KEY,
        },
        httpsAgent: agent,
      });
    } catch (error) {
      const textCreateRequestFailed =
        'Failed to create request. Please try again later.';
      const msgCreateFailed = {
        t: textCreateRequestFailed,
        mk: [
          {
            type: EMarkdownType.PRE,
            s: 0,
            e: textCreateRequestFailed.length,
          },
        ],
      };
      const channel = await this.client.channels.fetch(
        findW2requestData.channelId,
      );
      const message = await channel.messages.fetch(data.message_id);
      await message.update(msgCreateFailed);
    }
  }
  private taskId: Record<string, any> = { id: '' };
  async handleTaskW2Request(data) {
    const findUser = await this.userRepository.find({
      where: { userId: data.user_id, user_type: EUserType.MEZON },
    });
    const args = data.button_id.split('_');
    const buttonConfirmType = args[1];
    const titleTask = args[2];
    if (args[3]) {
      this.taskId = args[3];
    }
    const clan = await this.client.clans.fetch(
      process.env.KOMUBOTREST_CLAN_NCC_ID,
    );
    const user = await clan.users.fetch(data.user_id);
    if (data.button_id.split('_')[0] === EPMButtonTaskW2.APPROVE_TASK) {
      if (buttonConfirmType === EPMTaskW2Type.RESIGNATION) {
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `${titleTask} (${buttonConfirmType})`,
            fields: [
              {
                name: 'Last Working Day*',
                value: '',
                inputs: {
                  id: 'lastWorkingDay',
                  type: EMessageComponentType.DATEPICKER,
                  component: {
                    value: '123456789',
                  },
                },
              },
              {
                name: 'Note*',
                value: '',
                inputs: {
                  id: 'note',
                  type: EMessageComponentType.INPUT,
                  component: {
                    placeholder: '',
                    required: false,
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        const components = [
          {
            components: [
              {
                id: 'Cancel',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Cancel`,
                  style: EButtonMessageStyle.SECONDARY,
                },
              },
              {
                id: 'ConfirmResignationRequest',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Confirm`,
                  style: EButtonMessageStyle.SUCCESS,
                },
              },
            ],
          },
        ];
        const messageToUser: ReplyMezonMessage = {
          userId: data.user_id,
          textContent: '',
          messOptions: { embed, components },
        };
        this.messageQueue.addMessage(messageToUser);
      } else if (
        buttonConfirmType === EPMTaskW2Type.PROBATIONARY_CONFIRMATION
      ) {
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `${titleTask} (${buttonConfirmType})`,
            fields: [
              {
                name: 'Strength Points*',
                value: '',
                inputs: {
                  id: 'strengthPoints',
                  type: EMessageComponentType.INPUT,
                  component: {
                    placeholder: '',
                    required: false,
                    textarea: true,
                  },
                },
              },
              {
                name: 'Weakness Points*',
                value: '',
                inputs: {
                  id: 'weaknessPoints',
                  type: EMessageComponentType.INPUT,
                  component: {
                    placeholder: '',
                    required: false,
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        const components = [
          {
            components: [
              {
                id: 'Cancel',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Cancel`,
                  style: EButtonMessageStyle.SECONDARY,
                },
              },
              {
                id: 'ConfirmProbationaryConfirmationRequest',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Confirm`,
                  style: EButtonMessageStyle.SUCCESS,
                },
              },
            ],
          },
        ];
        const messageToUser: ReplyMezonMessage = {
          userId: data.user_id,
          textContent: '',
          messOptions: { embed, components },
        };
        this.messageQueue.addMessage(messageToUser);
      } else {
        try {
          await user.sendDM({ t: 'Sending Request...' });
          const payload = {
            id: this.taskId,
            email: `${findUser[0].username}@ncc.asia`,
          };
          const response = await axios.post(
            `${process.env.W2_REQUEST_API_BASE_URL}/approve-w2task`,
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                'x-secret-key': process.env.W2_REQUEST_X_SECRET_KEY,
              },
            },
          );

          if (response.status === 200) {
            await user.sendDM({ t: 'Approve Task Success!' });
          }
        } catch (error) {
          if (error.response.data.error.code === '409') {
            await user.sendDM({ t: `${error.response.data.error.message}!!` });
          } else {
            await user.sendDM({ t: `${error.message}` });
          }
        }
      }
    } else if (data.button_id.split('_')[0] === EPMButtonTaskW2.REJECT_TASK) {
      {
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `Reject  (${titleTask} - ${buttonConfirmType})`,
            fields: [
              {
                name: 'Reason*',
                value: '',
                inputs: {
                  id: 'submitRejectTask',
                  type: EMessageComponentType.INPUT,
                  component: {
                    id: 'submitRejectTask',
                    placeholder: 'Reason*',
                    required: false,
                    textarea: true,
                  },
                },
              },
            ],
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        const components = [
          {
            components: [
              {
                id: 'Reject',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Cancel`,
                  style: EButtonMessageStyle.SECONDARY,
                },
              },
              {
                id: 'submitRejectTask',
                type: EMessageComponentType.BUTTON,
                component: {
                  label: `Submit`,
                  style: EButtonMessageStyle.SUCCESS,
                },
              },
            ],
          },
        ];
        const messageToUser: ReplyMezonMessage = {
          userId: data.user_id,
          textContent: '',
          messOptions: { embed, components },
        };
        this.messageQueue.addMessage(messageToUser);
      }
    }
    if (data.button_id === EPMButtonTaskW2.SUBMIT_REJECT_TASK) {
      if (!data.extra_data) {
        await user.sendDM({ t: 'Missing Reason Reject Task!' });
        return;
      }
      const extraData = JSON.parse(data.extra_data);
      try {
        await user.sendDM({ t: 'Sending Request...' });
        const payload = {
          id: this.taskId,
          reason: extraData.submitRejectTask,
          email: `${findUser[0].username}@ncc.asia`,
        };
        if (payload.reason === '') {
          await user.sendDM({ t: 'Missing Reason Reject Task!' });
        }
        const response = await axios.post(
          `${process.env.W2_REQUEST_API_BASE_URL}/reject-w2task`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-secret-key': process.env.W2_REQUEST_X_SECRET_KEY,
            },
          },
        );
        if (response.status === 200) {
          await user.sendDM({ t: 'Rejected Task Success!' });
        }
      } catch (error) {
        if (error.response.data.error.code === '409') {
          await user.sendDM({ t: `${error.response.data.error.message}!!` });
        } else {
          await user.sendDM({ t: `${error.message}` });
        }
      }
    }
    if (data.button_id === EPMButtonTaskW2.CONFIRM_PROBATIONARY) {
      if (!data.extra_data) {
        await user.sendDM({ t: 'Missing Data' });
        return;
      }
      const extraData = JSON.parse(data.extra_data);
      try {
        await user.sendDM({ t: 'Sending Request...' });
        const payload = {
          dynamicActionData: JSON.stringify([
            {
              name: 'StrengthPoints',
              type: 'RichText',
              isRequired: true,
              data: extraData.note,
            },
            {
              name: 'StrengthPoints',
              type: 'RichText',
              isRequired: true,
              data: extraData.note,
            },
          ]),
        };

        const jsonPayload = {
          id: this.taskId,
          dynamicActionData: payload.dynamicActionData,
          email: `${findUser[0].username}@ncc.asia`,
        };
        console.log(jsonPayload);

        const response = await axios.post(
          `${process.env.W2_REQUEST_API_BASE_URL}/approve-w2task`,
          jsonPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-secret-key': process.env.W2_REQUEST_X_SECRET_KEY,
            },
          },
        );
        if (response.status === 200) {
          await user.sendDM({ t: 'Approve Task Success!' });
        }
      } catch (error) {
        console.log(error.response.data);

        if (error.response.data.error.code === '409') {
          await user.sendDM({ t: `${error.response.data.error.message}!!` });
        } else {
          await user.sendDM({ t: `${error.message}` });
        }
      }
    }
    if (data.button_id === EPMButtonTaskW2.COMFIRM_REGISNATION) {
      if (!data.extra_data) {
        await user.sendDM({ t: 'Missing Data !' });
        return;
      }
      const extraData = JSON.parse(data.extra_data);
      try {
        await user.sendDM({ t: 'Sending Request...' });
        const payload = {
          dynamicActionData: JSON.stringify([
            {
              name: 'LastWorkingDay',
              type: 'dateTime',
              isRequired: true,
              data: extraData.lastWorkingDay,
              defaultValue: extraData.lastWorkingDay,
            },
            {
              name: 'Note',
              type: 'RichText',
              isRequired: true,
              data: extraData.note,
            },
          ]),
        };

        const jsonPayload = {
          id: this.taskId,
          dynamicActionData: payload.dynamicActionData,
          email: `${findUser[0].username}@ncc.asia`,
        };
        const response = await axios.post(
          `${process.env.W2_REQUEST_API_BASE_URL}/approve-w2task`,
          jsonPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-secret-key': process.env.W2_REQUEST_X_SECRET_KEY,
            },
          },
        );
        if (response.status === 200) {
          await user.sendDM({ t: 'Approve Task Success!' });
        }
      } catch (error) {
        if (error.response.data.error.code === '409') {
          await user.sendDM({ t: `${error.response.data.error.message}!!` });
        } else {
          await user.sendDM({ t: `${error.message}` });
        }
      }
    }
  }

  async handlePMRequestAbsenceDay(data) {
    const splitButtonId = data.button_id.split('_');
    const typeButtonRes = splitButtonId[1]; // (approve or reject)
    const requestIdButton = splitButtonId[2];
    const requestIds = [Number(requestIdButton)];
    const usernameEmployee = splitButtonId[3];
    const typeRequest = splitButtonId[4];
    const dateAt = splitButtonId[5];
    const dateType = splitButtonId[6];
    try {
      // Find emailAddress by senderId
      const findUser = await this.userRepository
        .createQueryBuilder()
        .where(`"userId" = :userId`, { userId: data.user_id })
        .andWhere(`"deactive" IS NOT true`)
        .select('*')
        .getRawOne();

      if (!findUser) return;
      const authorUsername = findUser.email;
      const emailAddress = generateEmail(authorUsername);
      // Process requests status
      switch (typeButtonRes.trim()) {
        case EPMRequestAbsenceDay.APPROVE:
          try {
            // Call API pm approve request absence day
            const PmAbsenceDayRequestApprove =
              await this.timeSheetService.PMApproveRequestDay(
                requestIds,
                emailAddress,
              );
            if (PmAbsenceDayRequestApprove?.data?.success) {
              const embedSendMessageToPm: EmbedProps[] = [
                {
                  color: '#f2e357',
                  title: `Approve successfully the request: ${usernameEmployee} ${typeRequest} ${dateAt} ${dateType}`,
                },
              ];
              const messageToUser: ReplyMezonMessage = {
                userId: data.user_id,
                textContent: ``,
                messOptions: { embed: embedSendMessageToPm },
              };
              this.messageQueue.addMessage(messageToUser);
              return;
            } else {
              throw new Error('Request failed!');
            }
          } catch (error) {
            const messageError = error.response.data.error.message;
            const embedSendMessageToPm: EmbedProps[] = [
              {
                color: '#FF0000',
                title: `${messageError}`,
              },
            ];
            const messageToUser: ReplyMezonMessage = {
              userId: data.user_id,
              textContent: '',
              messOptions: { embed: embedSendMessageToPm },
            };
            this.messageQueue.addMessage(messageToUser);
          }
          break;
        default:
          try {
            // Call API pm reject request absence day
            const PmAbsenceDayRequestApprove =
              await this.timeSheetService.PMRejectRequestDay(
                requestIds,
                emailAddress,
              );
            if (PmAbsenceDayRequestApprove?.data?.success) {
              const embedSendMessageToPm: EmbedProps[] = [
                {
                  color: '#f2e357',
                  title: `Reject successfully the request: ${usernameEmployee} ${typeRequest} ${dateAt} ${dateType}`,
                },
              ];
              const messageToUser: ReplyMezonMessage = {
                userId: data.user_id,
                textContent: ``,
                messOptions: { embed: embedSendMessageToPm },
              };
              this.messageQueue.addMessage(messageToUser);
            } else {
              throw new Error('Request failed!');
            }
          } catch (error) {
            const messageError = error.response.data.error.message;
            const embedSendMessageToPm: EmbedProps[] = [
              {
                color: '#FF0000',
                title: `${messageError}`,
              },
            ];
            const messageToUser: ReplyMezonMessage = {
              userId: data.user_id,
              textContent: '',
              messOptions: { embed: embedSendMessageToPm },
            };
            this.messageQueue.addMessage(messageToUser);
          }
          break;
      }
    } catch (e) {
      console.error('handleRequestAbsence', e);
    }
  }

  async handleSubmitDailyPm(data) {
    const senderId = data.user_id;
    const botId = data.sender_id;
    const channelId = data.channel_id;
    const splitButtonId = data.button_id.split('_');
    const messid = splitButtonId[1];
    const clanIdValue = splitButtonId[2];
    const modeValue = splitButtonId[3];
    const codeMessValue = splitButtonId[4];
    const isPublicValue = splitButtonId[5] === 'false' ? false : true;
    const ownerSenderDaily = splitButtonId[6];
    const dateValue = splitButtonId[7];
    const buttonType = splitButtonId[8];
    const missingField =
      'Missing project, yesterday, today, block or task field';

    const isOwner = ownerSenderDaily === senderId;
    if (!isOwner) return;
    //init reply message
    const getBotInformation = await this.userRepository.findOne({
      where: { userId: botId },
    });

    const msg: ChannelMessage = {
      message_id: data.message_id,
      id: '',
      channel_id: channelId,
      channel_label: '',
      code: codeMessValue,
      create_time: '',
      sender_id: botId,
      username: getBotInformation.username,
      avatar: getBotInformation.avatar,
      content: { t: '' },
      attachments: [{}],
    };

    const isCancel = buttonType === EUnlockTimeSheet.CANCEL.toLowerCase();
    const isSubmit = buttonType === EUnlockTimeSheet.SUBMIT.toLowerCase();
    try {
      if (!data.extra_data) {
        if (
          (!isOwner && (isCancel || isSubmit)) ||
          (isOwner && (isCancel || isSubmit))
        ) {
          return;
        }
      }
      switch (buttonType) {
        case EUnlockTimeSheet.SUBMIT.toLowerCase():
          let parsedExtraData;
          try {
            parsedExtraData = JSON.parse(data.extra_data);
          } catch (error) {
            throw new Error('Invalid JSON in extra_data');
          }

          const projectKey = `daily-${messid}-project`;
          const yesterdayKey = `daily-${messid}-yesterday-ip`;
          const todayKey = `daily-${messid}-today-ip`;
          const blockKey = `daily-${messid}-block-ip`;
          const workingTimeKey = `daily-${messid}-working-time`;
          const typeOfWorkKey = `daily-${messid}-type-of-work`;
          const taskKey = `daily-${messid}-task`;

          const projectCode = parsedExtraData[projectKey];
          const yesterdayValue = parsedExtraData[yesterdayKey];
          const todayValue = parsedExtraData[todayKey];
          const blockValue = parsedExtraData[blockKey];
          const workingTimeValue = parsedExtraData[workingTimeKey];
          const typeOfWorkValue = parsedExtraData[typeOfWorkKey];
          const taskValue = parsedExtraData[taskKey];

          const isMissingField =
            !projectCode ||
            !yesterdayValue ||
            !todayValue ||
            !blockValue ||
            !taskValue;
          const contentGenerated = `*daily ${projectCode} ${dateValue}\n yesterday:${yesterdayValue}\n today:${todayValue}\n block:${blockValue}`;

          if (!isOwner) {
            return;
          }
          if (isMissingField) {
            const replyMessageMissingField = createReplyMessage(
              missingField,
              clanIdValue,
              channelId,
              isPublicValue,
              modeValue,
              msg,
            );
            return this.messageQueue.addMessage(replyMessageMissingField);
          }
          const findUser = await this.userRepository
            .createQueryBuilder()
            .where(`"userId" = :userId`, { userId: senderId })
            .andWhere(`"deactive" IS NOT true`)
            .select('*')
            .getRawOne();

          if (!findUser) return;

          const authorUsername = findUser.email;
          const emailAddress = generateEmail(authorUsername);

          const wfhResult = await this.timeSheetService.findWFHUser();
          const wfhUserEmail = wfhResult.map((item) =>
            getUserNameByEmail(item.emailAddress),
          );

          await this.saveDaily(
            senderId,
            channelId,
            contentGenerated as string,
            authorUsername,
          );

          await this.timeSheetService.logTimeSheetForTask(
            todayValue,
            emailAddress,
            projectCode,
            typeOfWorkValue,
            taskValue,
            workingTimeValue,
          );
          const isValidTimeFrame = checkTimeSheet();
          const isValidWFH = checkTimeNotWFH();
          const baseMessage = '✅ Daily saved.';
          const errorMessageWFH =
            '❌ Daily saved. (Invalid daily time frame. Please daily at 7h30-9h30, 12h-17h. WFH not daily 20k/time.)';
          const errorMessageNotWFH =
            '❌ Daily saved. (Invalid daily time frame. Please daily at 7h30-17h. not daily 20k/time.)';

          const messageContent = wfhUserEmail.includes(authorUsername)
            ? isValidTimeFrame
              ? baseMessage
              : errorMessageWFH
            : isValidWFH
              ? baseMessage
              : errorMessageNotWFH;

          const textDailySuccess =
            '' +
            messageContent +
            '\n' +
            `Date: ${dateValue}` +
            '\n' +
            `Yesterday: ${yesterdayValue}` +
            '\n' +
            `Today: ${todayValue}` +
            '\n' +
            `Block: ${blockValue}` +
            '\n' +
            `Working time: ${workingTimeValue}h` +
            '';
          const msgDailySuccess = {
            t: textDailySuccess,
            mk: [{ type: EMarkdownType.PRE, s: 0, e: textDailySuccess.length }],
          };
          const channelSucces = await this.client.channels.fetch(channelId);
          const messageSucces = await channelSucces.messages.fetch(
            data.message_id,
          );
          await messageSucces.update(msgDailySuccess);

          break;
        case EUnlockTimeSheet.CANCEL.toLowerCase():
          const textDailyCancelSuccess = 'The daily has been cancelled';
          const msgDailyCancelSuccess = {
            t: textDailyCancelSuccess,
            mk: [
              {
                type: EMarkdownType.PRE,
                s: 0,
                e: textDailyCancelSuccess.length,
              },
            ],
          };
          const channel = await this.client.channels.fetch(channelId);
          const message = await channel.messages.fetch(data.message_id);
          await message.update(msgDailyCancelSuccess);

          return;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in handleSubmitDailyPm:', error.message);
    }
  }

  async handleSelectVoucher(data) {
    try {
      const [_, typeButtonRes, authId, clanId, mode, isPublic] =
        data.button_id.split('_');
      const dataParse = JSON.parse(data.extra_data || '{}');
      const value = dataParse?.VOUCHER?.[0].split('_')?.[1];
      if (data.user_id !== authId) return;

      if (typeButtonRes === EmbebButtonType.CANCEL) {
        const textCancel = 'Cancel request successful!';
        const msgCancel = {
          t: textCancel,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textCancel.length }],
        };
        const channel = await this.client.channels.fetch(data.channel_id);
        const message = await channel.messages.fetch(data.message_id);
        await message.update(msgCancel);
      }
      if (!value) return;
      if (typeButtonRes === EmbebButtonType.CONFIRM) {
        const textConfirm =
          'Transaction is pending. KOMU sent you a message, please check!';
        const msgConfirm = {
          t: textConfirm,
          mk: [{ type: EMarkdownType.PRE, s: 0, e: textConfirm.length }],
        };
        const channel = await this.client.channels.fetch(data.channel_id);
        const message = await channel.messages.fetch(data.message_id);
        await message.update(msgConfirm);

        const sendTokenData = {
          sender_id: authId,
          receiver_id: process.env.BOT_KOMU_ID,
          note: `[${value} Voucher Buying]`,
          extra_attribute: JSON.stringify({
            sessionId: `buy_${value}_voucher`,
            appId: `buy_${value}_voucher`,
          }),
          ...(value === VoucherExchangeType.Market && { amount: 100000 }),
        };
        const qrCodeImage = await generateQRCode(JSON.stringify(sendTokenData));
        const embed: EmbedProps[] = [
          {
            color: getRandomColor(),
            title: `VOUCHER EXCHANGE ${value.toUpperCase()}!`,
            fields: [
              {
                name: `Scan this QR code for EXCHANGE VOUCHER ${value.toUpperCase()}!`,
                value: '',
              },
            ],
            image: {
              url: qrCodeImage + '',
              width: '300px',
              height: '300px',
            },
            timestamp: new Date().toISOString(),
            footer: MEZON_EMBED_FOOTER,
          },
        ];
        const messageToUser: ReplyMezonMessage = {
          userId: authId,
          textContent: '',
          messOptions: { embed },
        };
        this.messageQueue.addMessage(messageToUser);
      }
    } catch (error) {
      console.log('handleSelectVoucher Error', error);
    }
  }

  async handleSelectPoll(data) {
    try {
      await this.pollService.handleSelectPoll(data);
    } catch (error) {}
  }

  async handleCreatePoll(data) {
    try {
      await this.pollService.handleCreatePoll(data);
    } catch (error) {
      console.log('ERORR handleCreatePoll', error);
    }
  }

  async sendAnswerOfInterviewerToHr(data) {
    try {
      console.log('Received interview data for button ID:', data);
      const rawData = data.button_id.replace(/^interview_/, '');
      const [
        interviewId,
        interviewerName,
        interviewTime,
        candidateFulName,
        branchName,
        userType,
        positionName,
        cvId,
        interviewUrl,
        buttonAction,
      ] = rawData.split('|');

      const isAccept = buttonAction === 'btnAccept';
      console.log('Received interview select button', isAccept);
      await this.interviewRepository
        .createQueryBuilder()
        .update(InterviewerReply)
        .set({ isReply: true })
        .where(`"id" = :id`, {
          id: interviewId,
        })
        .execute();
      const interviewDescription = `${candidateFulName} - ${branchName} - ${UserType[userType]} - ${positionName} lúc ${interviewTime}`;
      const embed = [
        {
          color: getRandomColor(),
          title: '📢 Thông báo lịch phỏng vấn',
          description:
            '```' +
            `\nBạn có lịch phỏng vấn ${interviewDescription} \n` +
            `Bạn có thể tham gia buổi phỏng vấn này không ? \n` +
            `Link candidate: ${process.env.TALENT_FE_URL}app/candidate/${userType === UserType.Intern ? 'intern-list' : 'staff-list'}/${cvId}?userType=${Number(userType)}&tab=3 \n` +
            `Link phỏng vấn: ${interviewUrl} \n` +
            '```' +
            '\n(Cảm ơn bạn đã trả lời tin nhắn.)',
        },
      ];

      const channelDm = await this.channelDmMezonRepository.findOne({
        where: { username: interviewerName },
      });
      const channel = await this.client.channels.fetch(channelDm.channel_id);
      const message = await channel.messages.fetch(data.message_id);
      await message.update({ embed });

      const textContent = `${interviewerName} ${isAccept ? 'chấp nhận' : 'từ chối'} tham gia phỏng vấn ${interviewDescription}.`;
      // const findHrRole = await this.roleMezonRepository.findOne({
      //   where: { title: 'HR' },
      // });
      // console.log('Find hr role:', findHrRole);
      // const hrUsers = await this.userRepository
      //   .createQueryBuilder('user')
      //   .where(':role = ANY(user.roles)', { role: findHrRole.id })
      //   .andWhere('user.user_type = :userType', { userType: EUserType.MEZON })
      //   .getMany();
      // todo: hard code to send message, will be update later
      const hrUsers = [
        '1805137029512564736', //anh.ngothuc
        '1800478701561843712', //vy.truongngoccam
        '1800396411926220800', //hien.ngothu
        '1820647107783036928', //ngan.tonthuy
        '1783441451758129152', //giang.tranminhchau
        '1840671876997713920', //ha.tranngan
      ];
      hrUsers.forEach((hr) => {
        const messageToUser: ReplyMezonMessage = {
          userId: hr,
          textContent,
          messOptions: {
            mk: [{ type: 'b', s: 0, e: interviewerName.length }],
          },
        };
        this.messageQueue.addMessage(messageToUser);
      });
    } catch (error) {
      console.log('sendAnswerOfInterviewerToHr Error', error);
    }
  }
}
