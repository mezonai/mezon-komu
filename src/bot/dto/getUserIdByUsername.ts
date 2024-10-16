import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

export class GetUserIdByUsernameDTO {
    @ApiProperty({required: true})
    @IsOptional()
    readonly username?: string = '';
}

