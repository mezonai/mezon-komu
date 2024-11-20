import { Entity, Column, Index, PrimaryColumn } from 'typeorm';
import { TABLE } from '../constants/table';

@Index(['userId', 'channelId', 'joinAt', 'leaveAt'])
@Entity(TABLE.MEZON_TRACKER_STREAMING)
export class MezonTrackerStreaming {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text' })
  clanId: string;

  @Column({ type: 'text' })
  channelId: string;

  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'numeric', nullable: true })
  joinAt: number;

  @Column({ type: 'numeric', nullable: true })
  leaveAt: number;
}
