import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { TABLE } from '../constants/table';

export enum TransferType {
  REGULAR = 'regular',
  VOUCHER = 'voucher',
  UNLOCKTS = 'unlockTS',
  REWARD = 'reward',
  API = 'api',
  COBA = 'coBa',
}

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

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Database timestamp for record creation',
  })
  createdTimestamp: Date;
}
