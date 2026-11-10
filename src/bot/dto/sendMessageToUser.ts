import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { ChannelMessageContent } from 'mezon-sdk';

export class SendMessageToUserDTO {
    @ApiPropertyOptional()
    @IsOptional()
    readonly userId?: string = '';

    @ApiPropertyOptional()
    @IsOptional()
    readonly username?: string = '';

    @ApiProperty({required: true})
    @IsOptional()
    readonly message?: string = '';

    @ApiProperty()
    @IsOptional()
    readonly options?: any;
}

