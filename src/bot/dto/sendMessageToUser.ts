import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';
import { ChannelMessageContent } from 'mezon-sdk';

export class SendMessageToUserDTO {
    @ApiProperty({required: true})
    @IsOptional()
    readonly username?: string = '';

    @ApiProperty({required: true})
    @IsOptional()
    readonly message?: string = '';

    @ApiProperty()
    @IsOptional()
    readonly options?: ChannelMessageContent;
}

