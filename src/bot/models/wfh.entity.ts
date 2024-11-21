import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TABLE } from '../constants/table';
import { User } from './user.entity';

@Index(['user', 'userId', 'complain', 'pmconfirm', 'type'])
@Entity(TABLE.WFH)
export class WorkFromHome {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (state) => state.wfh)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ type: 'text' })
  wfhMsg: string;

  @Column({ type: 'decimal' })
  createdAt: number;

  @Column({ type: 'boolean' })
  complain: boolean;

  @Column({ type: 'boolean' })
  pmconfirm: boolean;

  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'text', nullable: true })
  data: string;

  @Column({ type: 'text', nullable: true })
  type: string;
}
