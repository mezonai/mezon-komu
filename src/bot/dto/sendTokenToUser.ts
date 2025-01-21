import { ApiProperty } from "@nestjs/swagger";

class UserReceiver {
  @ApiProperty()
  userId?: string;

  @ApiProperty()
  amount?: number;
}


export class SendTokenToUser {
  @ApiProperty({ type: () => [UserReceiver] })
  userReceiverList: UserReceiver[];
}