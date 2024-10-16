import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TABLE } from '../constants/table';
import { Bwl } from './bwl.entity';
import { Channel } from './channel.entity';
import { User } from './user.entity';

@Entity(TABLE.BWLREACTION)
export class BwlReaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bwl, (state) => state.bwlReaction)
  @JoinColumn({ name: 'bwlId' })
  bwl: Bwl;

  @ManyToOne(() => Channel, (state) => state.bwlReaction)
  @JoinColumn({ name: 'channelId' })
  channel: Channel;

  @Column({ type: 'text', nullable: true })
  guildId: string;

  @ManyToOne(() => User, (state) => state.bwlReaction)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ nullable: true })
  emoji: string;

  @Column()
  count: number;

  @Column({ type: 'decimal' })
  createdTimestamp: number;
}
