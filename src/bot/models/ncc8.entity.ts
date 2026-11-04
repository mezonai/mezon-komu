import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['ncc8Id'])
@Entity(TABLE.NCC8)
export class Ncc8 {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  ncc8Id: number;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  fileName: string;

  @Column({ type: 'text' })
  author: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  channelId: string;
}
