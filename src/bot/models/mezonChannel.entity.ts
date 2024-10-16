import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { TABLE } from '../constants/table';
@Entity(TABLE.CHANNEL_MEZON)
export class ChannelMezon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  clan_id: string;

  @Column({ type: 'text', nullable: true })
  category_id: string;

  @Column({ type: 'text', nullable: true })
  creator_id: string;

  @Column({ type: 'text', nullable: true })
  meeting_code: string;

  @Column({ type: 'text' })
  parrent_id: string | null;

  @Column({ type: 'text', unique: true })
  channel_id: string;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  channel_label: string;

  @Column({ type: 'int' })
  channel_private: number;

  @Column({ type: 'int' })
  channel_type: number;

  @Column({ type: 'int', nullable: true })
  status: number;

  @Column({ type: 'boolean', nullable: true })
  is_parent_public: boolean;
}
