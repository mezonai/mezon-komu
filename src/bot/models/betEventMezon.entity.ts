import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TABLE } from '../constants/table';
import { BetStatus } from '../constants/configs';

@Entity(TABLE.BET_EVENT_MEZON)
export class BetEventMezon {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ nullable: true, default: 0 })
  amount: number;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true })
  status: BetStatus;

  @Column({ type: 'text', nullable: true })
  eventId: string;

  @Column({ type: 'decimal', nullable: true })
  createdAt: number;
}
