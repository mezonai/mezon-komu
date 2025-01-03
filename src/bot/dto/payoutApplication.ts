import { ApiProperty } from "@nestjs/swagger";

class UserRewarded {
  @ApiProperty()
  userId?: string;

  @ApiProperty()
  amount?: number;
}


export class PayoutApplication {
  @ApiProperty()
  sessionId: string;

  @ApiProperty({ type: () => [UserRewarded] })
  userRewardedList: UserRewarded[];
}