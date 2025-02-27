import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['value', 'active', 'userId'])
@Entity(TABLE.VOUCHER)
export class VoucherEntiTy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  value: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ nullable: true, type: 'decimal' })
  buyAt: number;
}
