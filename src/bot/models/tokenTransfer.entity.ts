import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TABLE } from '../constants/table';

export enum TransferType {
  REGULAR = 'regular',
  API = 'api',
  VOUCHER = 'voucher',
  REWARD = 'reward',
}

@Index(['senderId', 'receiverId', 'createdAt'])
@Index(['transferType', 'createdAt'])
@Index(['createdAt'])
@Entity(TABLE.TOKEN_TRANSFER)
export class TokenTransfer {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', comment: 'Mezon user ID of sender' })
  senderId: string;

  @Column({ type: 'text', comment: 'Mezon user ID of receiver' })
  receiverId: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    comment: 'Amount transferred in tokens',
  })
  amount: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Optional note/message with transfer',
  })
  note: string;

  @Column({
    type: 'enum',
    enum: TransferType,
    default: TransferType.REGULAR,
    comment: 'Type of transfer: regular, api, voucher, reward',
  })
  transferType: TransferType;

  @Column({
    type: 'bigint',
    comment: 'Timestamp in milliseconds when transfer occurred',
  })
  createdAt: number;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Database timestamp for record creation',
  })
  createdTimestamp: Date;
}
