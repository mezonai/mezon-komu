import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Quiz } from 'src/bot/models/quiz.entity';
import { User } from 'src/bot/models/user.entity';
import { UserQuiz } from 'src/bot/models/userQuiz';
import { Repository } from 'typeorm';
import { KomuService } from './komu.services';
import { EUserType } from '../constants/configs';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { getRandomColor } from '../utils/helper';
import { EMessageComponentType, EButtonMessageStyle } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserQuiz)
    private userQuizRepository: Repository<UserQuiz>,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    private komubotrestService: KomuService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    private clientService: MezonClientService,
  ) {}

  async randomQuiz(userInput, roleSelect) {
    // context is message or client
    // message if this is commands
    // client if this is scheduler
    // type is commands or scheduler

    let roles;
    let roleRandom;
    if (!roleSelect) {
      // if (userInput.roles && userInput.roles.length > 0) {
      roles = ['policy', 'english', 'excel', 'dev'];
      roleRandom =
        roles[Math.floor(Math.random() * roles.length)].toLowerCase();
      // } else {
      //   roleRandom = 'policy';
      // }
    } else {
      roleRandom = roleSelect;
    }

    const questionAnswered = await this.userQuizRepository.find({
      where: {
        userId: userInput.userId,
      },
    });

    const questionAnsweredId = questionAnswered.map((item) => item.id);

    const questions = await this.quizRepository
      .createQueryBuilder('questions')
      .where(
        questionAnsweredId && questionAnsweredId.length > 0
          ? '"id" NOT IN (:...questionAnsweredId)'
          : 'true',
        {
          questionAnsweredId: questionAnsweredId,
        },
      )
      .andWhere('"role" = :roleRandom', { roleRandom: roleRandom })
      .andWhere('"isVerify" = True')
      .andWhere('"accept" = True')
      .andWhere('"title" IS NOT NULL')
      .andWhere('length("title") < :strLenCp', { strLenCp: 236 })
      .select('*')
      .orderBy('RANDOM()')
      .limit(1)
      .execute();

    if (Array.isArray(questions) && questions.length === 0) {
      return false;
      //   const mess = 'You have answered all the questions!!!';
      //   if (type === 'commands') {
      //     await context.channel.send(mess).catch(console.error);
      //   } else {
      //     return;
      //   }
    } else {
      return questions[0];
    }
  }

  async sendQuizToSingleUser(userInput, botPing = false, roleSelect = null) {
    if (!userInput) return;
    const userId = userInput.userId;
    const channelDm = await this.channelDmMezonRepository.findOne({
      where: { user_id: userId },
    });
    let channelDmId = channelDm?.channel_id;
    if (!channelDmId) {
      const newDmChannel = await this.clientService.createDMchannel(userId);
      if (!newDmChannel) {
        console.log('userId missed', userId);
      }
      channelDmId = newDmChannel?.channel_id;
    }
    const username = userInput.username;

    const q = await this.randomQuiz(userInput, roleSelect);

    if (!q) return;

    let { mess, components, embed } = this.generateQuestion(q, channelDmId);
    mess = `${mess}\n(Chọn đáp án đúng tương ứng phía bên dưới!)`;
    const sendMess = await this.komubotrestService.sendMessageKomuToUser(
      mess,
      userId,
      botPing,
      true,
      components,
      embed,
    );

    if (sendMess) {
      await this.saveQuestion(
        userId,
        q.id,
        sendMess.message_id,
        sendMess.channel_id,
      );
    }
  }

  generateQuestion(question, channelDmId) {
    const color = getRandomColor();
    const title = question.topic
      ? `[${question.topic.toUpperCase()}] ${question.title}`
      : question.title;
    const buttons = [];
    const mess = `${title}\n ${question.options
      .map((otp, index) => {
        buttons.push({
          type: EMessageComponentType.BUTTON,
          id: `question_${index + 1}_${channelDmId}_${color}`,
          component: {
            label: `${index + 1}`,
            style: EButtonMessageStyle.PRIMARY,
          },
        });
        return `${index + 1} - ${otp}`;
      })
      .join('\n ')}`;

    const components = [
      {
        components: buttons,
      },
    ];
    const embed = [
      {
        color: color,
        title: `${title}`,
        description:
          '```' +
          '\n' +
          `${question.options
            .map((otp, index) => {
              return `${index + 1} - ${otp}`;
            })
            .join('\n')}` +
          '```' +
          '\n(Chọn đáp án đúng tương ứng phía bên dưới!)',
      },
    ];
    return { mess, components, embed };
  }
  async addScores(userId) {
    try {
      const user = await this.userRepository
        .createQueryBuilder()
        .where('"userId" = :userId', { userId: userId })
        .andWhere('"deactive" IS NOT True')
        .andWhere('user_type = :userType', { userType: EUserType.MEZON })
        .select('*')
        .execute();

      if (!user) return;

      if (user[0]?.scores_quiz) {
        await this.userRepository
          .createQueryBuilder()
          .update(User)
          .set({ scores_quiz: user[0].scores_quiz + 5 })
          .where('"userId" = :userId', { userId: user[0].userId })
          .execute()
          .catch(console.error);
      } else {
        await this.userRepository
          .createQueryBuilder()
          .update(User)
          .set({ scores_quiz: 5 })
          .where('"userId" = :userId', { userId: user[0].userId })
          .execute()
          .catch(console.error);
      }
      const newUser = await this.userRepository
        .createQueryBuilder()
        .where('"userId" = :userId', { userId: user[0].userId })
        .select('*')
        .execute()
        .catch(console.error);
      return newUser;
    } catch (error) {
      console.log(error);
    }
  }

  async saveQuestionCorrect(userId, questionid, answerkey) {
    try {
      await this.userQuizRepository
        .createQueryBuilder()
        .update(UserQuiz)
        .set({ correct: true, answer: answerkey, updateAt: Date.now() })
        .where(`"userId" = :userId`, { userId: userId })
        .andWhere(`"quizId" = :quizId`, {
          quizId: questionid,
        })
        .execute();
    } catch (error) {
      console.log(error);
    }
  }

  async saveQuestionInCorrect(userId, questionid, answerkey) {
    try {
      await this.userQuizRepository
        .createQueryBuilder()
        .update(UserQuiz)
        .set({ correct: false, answer: answerkey, updateAt: Date.now() })
        .where(`"userId" = :userId`, { userId: userId })
        .andWhere(`"quizId" = :quizId`, {
          quizId: questionid,
        })
        .execute();
    } catch (error) {
      console.log(error);
    }
  }
  saveQuestion(userId, questionid, message_id, channel_id) {
    return this.userQuizRepository.insert({
      userId,
      quizId: questionid,
      message_id,
      channel_id,
      createAt: Date.now(),
    });
  }
}
