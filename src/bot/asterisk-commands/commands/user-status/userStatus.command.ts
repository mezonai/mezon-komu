import { ChannelMessage } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { UserStatusService } from './userStatus.service';
import { ClientConfigService } from 'src/bot/config/client-config.service';
import { EUserStatusCommand } from './userStatus.constants';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';

@Command('userstatus')
export class UserStatusCommand extends CommandMessage {
  constructor(
    private userStatusService: UserStatusService,
    private readonly clientConfig: ClientConfigService,
    private readonly axiosClientService: AxiosClientService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent: EUserStatusCommand;
    if (args[0] === 'help' || !args[0]) {
      return this.replyMessageGenerate(
        {
          messageContent: EUserStatusCommand.HELP,
          mk: [{ type: 't', s: 0, e: EUserStatusCommand.HELP.length }],
        },
        message,
      );
    }
    const userEmail = args[0];
    const user = await this.userStatusService.getUserByEmail(userEmail);

    if (user.length === 0) {
      messageContent = EUserStatusCommand.WRONG_EMAIL;
    } else {
      const url = `${this.clientConfig.user_status.api_url_userstatus}?emailAddress=${userEmail}@ncc.asia`;
      const response = await this.axiosClientService.get(url);

      const getUserStatus = response.data;
      if (!getUserStatus) return;

      messageContent = getUserStatus.result
        ? getUserStatus.result.message
        : EUserStatusCommand.WORK_AT_HOME;
    }
    return this.replyMessageGenerate({ messageContent }, message);
  }
}
