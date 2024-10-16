import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

export class SendEmbedMessageDTO {
  @ApiProperty({ required: true })
  @IsOptional()
  title?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  description?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  image?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  channelId?: string = "";

  @ApiProperty({ required: true })
  @IsOptional()
  userId?: string = "";
}
