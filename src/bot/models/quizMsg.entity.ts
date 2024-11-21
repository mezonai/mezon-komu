import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TABLE } from '../constants/table';

@Index(['quiz_id', 'message_id', 'channel_id', 'user_id'])
@Entity(TABLE.QUIZ_MSG)
export class QuizMsg {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  quiz_id: string;

  @Column({ type: 'text' })
  message_id: string;

  @Column({ type: 'text' })
  channel_id: string;

  @Column({ type: 'text', nullable: true })
  user_id: string;

  @Column()
  answer_id: number;

  @Column('timestamp')
  time_answer: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
