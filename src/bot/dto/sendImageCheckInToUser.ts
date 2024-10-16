import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

export class SendImageCheckInToUserDTO {
  @ApiProperty({ required: true })
  @IsOptional()
  username?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  verifiedImageId?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  pathImage?: string = "";
}

export class SendImageLabelToUserDTO {
  @ApiProperty({ required: true })
  @IsOptional()
  username?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  imageLabelId?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  pathImage?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  questionType?: string = "";
}
