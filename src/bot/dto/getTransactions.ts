import { IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransferType } from '../models/tokenTransfer.entity';

export class GetTransactionsDTO {
  @ApiProperty({
    description: 'Type filter (voucher/unlockTS/coBa/null for all)',
    required: false,
    enum: TransferType,
    example: TransferType.VOUCHER,
  })
  @IsOptional()
  @IsEnum(TransferType)
  type?: TransferType;

  @ApiProperty({
    description: 'Start date for filtering transactions (ISO string)',
    required: false,
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({
    description: 'End date for filtering transactions (ISO string)',
    required: false,
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
