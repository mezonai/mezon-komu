import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from 'mezon-sdk';
import { BaseHandleEvent } from './base.handle';
import { MezonClientService } from 'src/mezon/services/client.service';
import { MentionSchedulerService } from '../scheduler/mention-scheduler.services';
import { ClientConfigService } from '../config/client-config.service';
import { MessageQueue } from '../services/messageQueue.service';
import { ChannelDMMezon } from '../models/channelDmMezon.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../models';
import { EUserType } from '../constants/configs';

@Injectable()
export class EventAddClanUser extends BaseHandleEvent {
  constructor(
    clientService: MezonClientService,
    @InjectRepository(ChannelDMMezon)
    private channelDmMezonRepository: Repository<ChannelDMMezon>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super(clientService);
  }

  @OnEvent(Events.AddClanUser)
  async handleAddClanUser(data) {
    try {
      const textWelcome = [
        'Hoan nghênh thành viên mới! Ở đây không có gì là không thể, chỉ có bug là bất tử thôi! 😂🔧',
        'Chào mừng bạn gia nhập nhacuachung! Ở đây, dù bạn là coder, tester hay designer, tất cả đều chiến hết mình! 💻🎨🔥',
        'Chào mừng đến với nhacuachung! Ở đây không phân biệt bạn là coder, tester hay designer, quan trọng là cùng nhau chiến! 💻🎨🔥',
        "Ở nhacuachung chúng ta không chỉ 'code', mà còn 'bật' cả tương lai! Welcome onboard!  🚀🌐",
        'Welcome to the clan! Dù bạn đến từ hành tinh nào trong giới tech, chúng ta sẽ cùng nhau xây dựng một thế giới mới! 🌌⚡',
        'Ố ồ, ai đây? Chào mừng người bạn mới! Bot mình ở đây để làm bạn bất ngờ với sự vui tính và hữu ích của mình! 😜🎉',
        'Hehe, thấy bạn rồi nhé! Mình đã sẵn sàng giúp đỡ bạn, nhưng nhớ rằng mình còn cực vui tính đấy! Let’s roll! 🎉💬',
        'Welcome to nhacuachung. Đập tay nào! Bạn vừa kết nạp một đồng đội là bot mình, chuyên gia về mọi thứ và còn hài hước nữa! 😜✋',
      ];
      const randomIndexVoiceChannel = Math.floor(
        Math.random() * textWelcome.length,
      );
      const DMchannel = await this.client.createDMchannel(data?.user?.user_id);
      if (!DMchannel) return;
      await this.client.sendDMChannelMessage(
        DMchannel.channel_id,
        textWelcome[randomIndexVoiceChannel],
      );
      const dataInsert = {
        user_id: data?.user?.user_id,
        channel_id: DMchannel.channel_id,
        username: data?.user?.username,
      };

      await this.channelDmMezonRepository.insert(dataInsert);
      if (data?.user?.user_id) {
        const findUser = await this.userRepository.findOne({
          where: { userId: data?.user?.user_id },
        });

        if (findUser) {
          findUser.discriminator = '0';
          findUser.avatar = data?.user?.avatar;
          findUser.display_name = data?.user?.display_name ?? '';
          findUser.user_type = EUserType.MEZON;
          findUser.last_message_time = Date.now();
          await this.userRepository.update(
            { userId: data?.user?.user_id },
            findUser,
          );
          return;
        }

        const komuUser = {
          userId: data?.user?.user_id,
          username: data?.user?.username,
          discriminator: '0',
          avatar: data?.user?.avatar,
          bot: false,
          system: false,
          email: data?.user?.username,
          display_name: data?.user?.display_name ?? '',
          clan_nick: data?.user?.clan_nick ?? '',
          flags: 0,
          last_message_id: null,
          last_message_time: Date.now(),
          scores_quiz: 0,
          deactive: false,
          botPing: false,
          scores_workout: 0,
          not_workout: 0,
          user_type: EUserType.MEZON,
          createdAt: Date.now(),
        };

        await this.userRepository.insert(komuUser);
      }
    } catch (error) {
      console.log('give coffee', error);
    }
  }
}
