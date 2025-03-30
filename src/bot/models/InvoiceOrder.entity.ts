import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TABLE } from '../constants/table';
import { StatusInvoiceType } from '../constants/configs';

@Index(['itemId', 'seller', 'buyer'])
@Entity(TABLE.INVOICE_ORDER)
export class InvoiceOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  itemId: string;

  @Column({ nullable: true })
  seller: string;

  @Column({ nullable: true })
  buyer: string;

  @Column({ nullable: true })
  status: StatusInvoiceType;

  @Column({ nullable: true })
  channelId: string;

  @Column({ type: 'decimal', nullable: true })
  createdAt: number;
}
