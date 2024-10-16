import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SendMessageToChannelDTO } from "../dto/sendMessageToChannel";
import { User } from "../models/user.entity";

@Injectable()
export class RegexEmailPipe implements PipeTransform {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}
  async transform(sendMessageToChannelDTO: SendMessageToChannelDTO) {
    if (!sendMessageToChannelDTO.message) {
      return sendMessageToChannelDTO
    }
    const regex = new RegExp(/\${([^{}]+)}/g);
    const emails = sendMessageToChannelDTO.message.match(
      /(?<=\${)(.[^}]+)(?=})/g
    );
    if (!emails) {
      return sendMessageToChannelDTO;
    }
    const users = await this.userRepository
      .createQueryBuilder("user")
      .where('"email" IN (:...emails) and user_type is null', { emails })
      .select("*")
      .getRawMany();

    sendMessageToChannelDTO.message = sendMessageToChannelDTO.message.replace(
      regex,
      (m, value) => {
        const user = users.find((item) => item.email === value);
        return user ? `<@${user.userId}>` : value;
      }
    );
    return sendMessageToChannelDTO;
  }
}
