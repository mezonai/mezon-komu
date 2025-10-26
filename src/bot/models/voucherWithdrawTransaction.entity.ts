import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TABLE } from '../constants/table';

export enum ETransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
}

@Index(['userId', 'status'])
@Entity(TABLE.VOUCHER_WITHDRAW)
export class VoucherWithDrawEntiTy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: false })
  userId: string;

  @Column({ type: 'numeric', default: 0 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ETransactionStatus,
    default: ETransactionStatus.PENDING,
  })
  status: ETransactionStatus;

  @Column({ nullable: true, type: 'decimal' })
  createdAt: number;
}
