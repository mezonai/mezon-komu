import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'channelId', 'cancel', 'reminder'])
@Entity(TABLE.MEETING)
export class Meeting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  channelId: string;

  @Column({ type: 'decimal', nullable: true })
  createdTimestamp: number;

  @Column({ type: 'text', nullable: true })
  task: string;

  @Column({ type: 'text', nullable: true })
  repeat: string;

  @Column({ nullable: true, default: false })
  cancel: boolean;

  @Column({ nullable: true, default: false })
  reminder: boolean;

  @Column({ nullable: true })
  repeatTime: string;
}
