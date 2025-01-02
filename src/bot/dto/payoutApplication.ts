import { ApiProperty } from "@nestjs/swagger";

class UserRewarded {
  @ApiProperty()
  username?: string;

  @ApiProperty()
  amount?: number;
}


export class PayoutApplication {
  @ApiProperty()
  sessionId: string;

  @ApiProperty({ type: () => [UserRewarded] })
  userRewardedList: UserRewarded[];
}