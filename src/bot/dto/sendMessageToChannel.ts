import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional} from "class-validator";

export class SendMessageToChannelDTO {
  @ApiPropertyOptional()
  @IsOptional()
  file?: Express.Multer.File;

  @ApiPropertyOptional()
  @IsOptional()
  fileUrl?: string;

  @ApiProperty({ required: true })
  channelId: string = "";

  @ApiProperty({ required: true })
  message: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  machleo?: boolean;

  @ApiProperty({ required: true })
  @IsOptional()
  machleo_userid?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  wfhid?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  username?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  createdate?: Date;

  @ApiProperty({ required: true, default: false })
  @IsOptional()
  timesheet?: boolean;
}
