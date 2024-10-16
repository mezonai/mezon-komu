import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsArray, ArrayNotEmpty } from "class-validator";
export class GetUserIdByEmailDTO {
  @ApiProperty({ required: true })
  @IsOptional()
  readonly email?: string = "";
}

export class GetListInfoUserDto {
  @ApiProperty({
    description: "Array of emails",
    required: true,
    type: [String],
  })
  @IsArray({ message: "Emails must be an array" })
  @ArrayNotEmpty({ message: "Emails array must not be empty" })
  readonly emails: string[];
}
