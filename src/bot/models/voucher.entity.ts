import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['link', 'active', 'userId', 'expiredDate'])
@Entity(TABLE.VOUCHER)
export class VoucherEntiTy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  link: string;

  @Column({ type: 'text', unique: true })
  voucherSerial: string;

  @Column({ type: 'text', nullable: true })
  brand: string;

  @Column({ type: 'text', nullable: true })
  productName: string;

  @Column({ nullable: true })
  price: number;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ nullable: true, type: 'decimal' })
  buyAt: number;

  @Column({ type: 'text', nullable: true })
  transactionRefID: string;

  @Column({ type: 'text', nullable: true })
  PONumber: string;

  @Column({ nullable: true, type: 'text' })
  issueDate: string;

  @Column({ nullable: true, type: 'text' })
  expiredDate: string;
}
