import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EUserType } from 'src/bot/constants/configs';
import { Order, User } from 'src/bot/models';
import { Repository } from 'typeorm';

@Injectable()
export class OrderCommandService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}
  async getUserCancelOrder(
    channelId: string,
    author: string,
    username: string,
  ) {
    return await this.orderRepository
      .createQueryBuilder('orders')
      .where(`"channelId" = :channelId`, {
        channelId: channelId,
      })
      .andWhere(`"isCancel" IS NOT True`, { isCancel: false })
      .andWhere(`"userId" = :userId`, {
        userId: author,
      })
      .andWhere(`"username" = :username`, {
        username: username,
      })
      .select('orders.*')
      .execute();
  }

  async upDateUserCancel(item) {
    return await this.orderRepository
      .createQueryBuilder('orders')
      .update(Order)
      .set({ isCancel: true })
      .where('id = :id', { id: item.id })
      .execute();
  }

  async getListUserOrderPending(
    channelId: string,
    author: string,
    username: string,
  ) {
    return await this.orderRepository
      .createQueryBuilder('orders')
      .where(`"channelId" = :channelId`, {
        channelId: channelId,
      })
      .andWhere(`"isCancel" IS NOT TRUE`)
      .andWhere(`"userId" = :userId`, { userId: author })
      .andWhere(`"username" = :username`, {
        username: username,
      })
      .select('orders.*')
      .execute();
  }

  async getListUserFinish(channelId: string, yesterdayDate, tomorrowDate) {
    const arrayUser = await this.orderRepository
      .createQueryBuilder('orders')
      .select('username')
      .addSelect('MAX("createdTimestamp")', 'timeStamp')
      .where(`"channelId" = :channelId`, {
        channelId: channelId,
      })
      .andWhere(`"isCancel" IS NOT TRUE`)
      .andWhere(`"createdTimestamp" > ${yesterdayDate}`)
      .andWhere(`"createdTimestamp" < ${tomorrowDate}`)
      .groupBy('username')
      .execute();

    return await this.orderRepository
      .createQueryBuilder('orders')
      .where('"createdTimestamp" IN (:...time_stamps)', {
        time_stamps: arrayUser.map((item) => item.timeStamp),
      })
      .select('orders.*')
      .execute();
  }

  async updateFinishOrder(channelId) {
    return await this.orderRepository
      .createQueryBuilder('orders')
      .where(`"channelId" = :channelId`, {
        channelId: channelId,
      })
      .andWhere(`"isCancel" IS NOT True`, {
        isCancel: false,
      })
      .select('orders.*')
      .execute();
  }

  async order(channelId: string, author: string, username: string, list) {
    return await this.orderRepository.insert({
      channelId: channelId,
      userId: author,
      username: username,
      menu: list,
      createdTimestamp: Date.now(),
      isCancel: false,
    });
  }

  async getUserByUserId(author: String) {
    return await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :userId`, { userId: author })
      .andWhere(`"deactive" IS NOT true`)
      .andWhere('user_type = :userType', { userType: EUserType.MEZON })
      .select('*')
      .getRawOne();
  }
}
