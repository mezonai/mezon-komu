import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

export class DeleteMessageDTO {
    @ApiProperty({required: true})
    @IsOptional()
    readonly channelId?: string = '';

    @ApiProperty({required: true})
    @IsOptional()
    readonly messageId?: string = '';
}

