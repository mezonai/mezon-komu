import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Entity(TABLE.MENTIONED_PM_CONFIRM)
export class MentionedPmConfirm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  messageId: string;

  @Column({ nullable: true })
  wfhId: number;

  @Column({ nullable: true })
  confirm: boolean;

  @Column({ nullable: true })
  value: string;

  @Column({ type: 'decimal', default: null })
  confirmAt: number;
}
