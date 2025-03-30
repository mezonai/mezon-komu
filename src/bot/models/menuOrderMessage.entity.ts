import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';
import { TypeOrderMessage } from '../constants/configs';

@Index(['messageId', 'clanId', 'channelId', 'author', 'isEdited', 'type'])
@Entity(TABLE.MENU_ORDER_MESSAGE)
export class MenuOrderMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  messageId: string;

  @Column({ nullable: true })
  clanId: string;

  @Column({ nullable: true })
  channelId: string;

  @Column({ nullable: true })
  mode: number;

  @Column({ nullable: true })
  isPublic: boolean;

  @Column({ nullable: true })
  author: string;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ nullable: true })
  type: TypeOrderMessage;

  @Column({ type: 'decimal', nullable: true })
  createdAt: number;
}
