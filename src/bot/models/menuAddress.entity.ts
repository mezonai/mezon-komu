import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['id', 'name', 'image', 'address', 'link'])
@Entity(TABLE.MENU_ADDRESS)
export class MenuAddress{
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  key: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  image: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  corner: string;

  @Column({ nullable: true })
  link: string;
}
