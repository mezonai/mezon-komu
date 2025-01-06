import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'sessionId', 'appId', 'username', 'amount'])
@Entity(TABLE.TRANSACTION)
export class Transaction {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  sessionId: string;

  @Column({ type: 'text' })
  appId: string;

  @Column({ type: 'text' })
  username: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ type: 'decimal' })
  createdAt: number;
}
