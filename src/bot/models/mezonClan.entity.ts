import { Column, Entity, PrimaryColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Entity(TABLE.MEZON_CLAN)
export class MezonClan {
  @PrimaryColumn({ type: 'text' })
  clan_id: string;

  @Column({ type: 'text', nullable: true })
  clan_name: string;

  @Column({ type: 'text', nullable: true })
  owner: string;

  @Column({ nullable: true, default: false })
  can_use_command: boolean;

  @Column('text', { array: true, nullable: true })
  blocked_commands: string[];

  @Column({ type: 'numeric', nullable: true })
  createdAt: number;
}
