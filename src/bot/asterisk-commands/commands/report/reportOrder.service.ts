import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from 'src/bot/models/order.entity';
import { UtilsService } from 'src/bot/services/utils.services';
import { Repository } from 'typeorm';

@Injectable()
export class ReportOrderService {
  constructor(
    private utilsService: UtilsService,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async reportOrder(message) {
    try {
      const channel = message.channel_id;

      const arrayUser = await this.orderRepository
        .createQueryBuilder('orders')
        .select('username')
        .addSelect('MAX("createdTimestamp")', 'timeStamp')
        .where(`"channelId" = :channelId`, {
          channelId: channel,
        })
        .andWhere(`"isCancel" IS NOT TRUE`)
        .andWhere(
          `"createdTimestamp" > ${this.utilsService.getYesterdayDate() + 60000 * 60 * 7}`,
        )
        .andWhere(`"createdTimestamp" < ${this.utilsService.getTomorrowDate() + 60000 * 60 * 7}`) 
        .groupBy('username')
        .execute();

      if (arrayUser.length > 0) {
        const listOrder = await this.orderRepository
          .createQueryBuilder('orders')
          .where('"createdTimestamp" IN (:...time_stamps)', {
            time_stamps: arrayUser.map((item) => item.timeStamp),
          })
          .select('orders.*')
          .execute();

        if (!listOrder) {
          return;
        } else if (Array.isArray(listOrder) && listOrder.length === 0) {
          return ['Không có ai order'];
        } else {
          const listMessage = [];
          for (let i = 0; i <= Math.ceil(listOrder.length / 50); i += 1) {
            if (listOrder.slice(i * 50, (i + 1) * 50).length === 0) break;
            const mess = listOrder
              .slice(i * 50, (i + 1) * 50)
              .map(
                (list) => `<${list.username}> order ${list.menu.toUpperCase()}`,
              )
              .join('\n');
            listMessage.push(
              `Danh sách order ngày hôm nay tổng là ${listOrder.length} người:\n` +
                mess,
            );
          }
          return listMessage;
        }
      } else {
        return ['Không có ai order'];
      }
    } catch (error) {
      console.log(error);
    }
  }
}
