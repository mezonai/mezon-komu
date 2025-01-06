import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'apiKey'])
@Entity(TABLE.APPLICATION)
export class Application {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  apiKey: string;
}
