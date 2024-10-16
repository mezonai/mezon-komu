import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

export class SendMessageToUserDTO {
    @ApiProperty({required: true})
    @IsOptional()
    readonly username?: string = '';

    @ApiProperty({required: true})
    @IsOptional()
    readonly message?: string = '';
}

