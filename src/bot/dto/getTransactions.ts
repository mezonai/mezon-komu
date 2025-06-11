import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  IsEnum,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum TransferType {
  REGULAR = 'regular',
  VOUCHER = 'voucher',
  UNLOCKTS = 'unlockTs',
}

export class GetTransactionsDTO {
  @ApiProperty({
    description: 'Sender ID to filter transactions',
    required: false,
    example: 'user123',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({
    description: 'Receiver ID to filter transactions',
    required: false,
    example: 'user456',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiProperty({
    description: 'Minimum amount to filter transactions',
    required: false,
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiProperty({
    description: 'Maximum amount to filter transactions',
    required: false,
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiProperty({
    description: 'Transfer type to filter',
    required: false,
    enum: TransferType,
    example: TransferType.REGULAR,
  })
  @IsOptional()
  @IsEnum(TransferType)
  transferType?: TransferType;

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

  @ApiProperty({
    description: 'Field to sort by',
    required: false,
    example: 'createdAt',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'amount', 'senderUsername', 'receiverUsername'])
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    required: false,
    enum: SortOrder,
    example: SortOrder.DESC,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiProperty({
    description: 'Page number for pagination',
    required: false,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page (max 100)',
    required: false,
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}
