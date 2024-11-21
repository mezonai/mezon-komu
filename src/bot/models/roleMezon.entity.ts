import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TABLE } from '../constants/table';

@Index(['id', 'title', 'clan_id'])
@Entity(TABLE.ROLE_MEZON)
export class RoleMezon {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  color: string;

  @Column({ type: 'text', nullable: true })
  role_icon: string;

  @Column({ type: 'text', nullable: true, default: null })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  creator_id: string;

  @Column({ type: 'text', nullable: true })
  clan_id: string;

  @Column({ nullable: true })
  active: number;

  @Column({ nullable: true })
  display_online: number;

  @Column({ nullable: true })
  allow_mention: number;

  @Column({ type: 'text', nullable: true })
  role_user_list: string;

  @Column({ type: 'text', nullable: true })
  permission_list: string;

  @Column({ nullable: true })
  role_channel_active: number;

  @Column({ type: 'text', array: true, nullable: true })
  channel_ids: string[];

  @Column({ nullable: true })
  max_level_permission: number;
}
