import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TABLE } from '../constants/table';

@Entity(TABLE.EVENT_MEZON)
export class EventMezon {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text', nullable: true })
  logo: string;

  @Column({ type: 'text', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  clandId: string;

  @Column({ type: 'text', nullable: true })
  channelId: string;

  @Column({ type: 'text', nullable: true })
  channelVoiceId: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  activeBet: boolean;

  @Column({ nullable: true })
  active: boolean;

  @Column({ type: 'decimal', nullable: true })
  timeStart: number;

  @Column({ type: 'decimal', nullable: true })
  timeEnd: number;
}
