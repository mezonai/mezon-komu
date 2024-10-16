import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";

export class ReportDailyDTO {
  @ApiProperty()
  @IsNotEmpty()
  from?: string;

  @ApiProperty()
  @IsNotEmpty()
  to?: string;
}