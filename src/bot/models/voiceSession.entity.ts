import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'user_id', 'clan_id', 'voice_channel_id', 'joined_at', 'left_at'])
@Entity(TABLE.VOICE_SESSION)
export class VoiceSession {
  @PrimaryColumn()
  id: string;

  @Column()
  user_id: string;

  @Column()
  clan_id: string;

  @Column()
  voice_channel_id: string;

  @Column({ type: 'text', nullable: true })
  event_id: string | null;

  @Column({ type: 'boolean', default: false })
  is_in_event: boolean;

  @Column({ type: 'timestamp', nullable: true })
  joined_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  left_at: Date;
}
