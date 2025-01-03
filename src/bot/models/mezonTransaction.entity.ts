import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'sessionId', 'appId', 'username', 'amount'])
@Entity(TABLE.TRANSACTION)
@Unique(['sessionId', 'senderId'])
export class Transaction {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  sessionId: string;

  @Column({ type: 'text' })
  appId: string;

  @Column({ type: 'text' })
  username: string;

  @Column({ type: 'text', default: null })
  senderId: string;

  @Column({ type: 'text', default: null })
  receiverId: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ type: 'decimal' })
  createdAt: number;
}
