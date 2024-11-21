import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TABLE } from '../constants/table';

@Index(['user_id', 'username'])
@Entity(TABLE.CHANNEL_DM_MEZON)
export class ChannelDMMezon {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'text' })
  user_id: string;

  @Column({ type: 'text'})
  username: string;

  @Column({ type: 'text' })
  channel_id: string;
}
