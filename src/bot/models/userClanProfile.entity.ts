import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';

import { TABLE } from '../constants/table';
import { User } from './user.entity';

@Index(['userId', 'clan_id'], { unique: true })
@Entity(TABLE.USER_CLAN_PROFILE)
export class UserClanProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  clan_id: string;

  @Column({ type: 'text', nullable: true })
  username: string;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  clan_nick: string;

  @Column({ type: 'text', nullable: true })
  avatar: string;

  @Column({ type: 'text', nullable: true })
  clan_avatar: string;

  @Column({ type: 'text', nullable: true })
  last_message_id: string;

  @Column({ type: 'numeric', nullable: true })
  last_message_time: number;

  @Column({ nullable: true, default: false })
  deactive: boolean;

  @Column({ type: 'numeric', nullable: true })
  createdAt: number;
}
