import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['quizId', 'userId', 'message_id', 'channel_id'])
@Entity(TABLE.USERQUIZ)
export class UserQuiz {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  quizId: number;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ type: 'text', nullable: true })
  message_id: string;

  @Column({ type: 'text', nullable: true, default: null })
  channel_id: string;

  @Column({ nullable: true })
  correct: boolean;

  @Column({ nullable: true })
  answer: number;

  @Column({ nullable: true, type: 'decimal' })
  createAt: number;

  @Column({ nullable: true, type: 'decimal' })
  updateAt: number;
}
