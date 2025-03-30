import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['name', 'price', 'category', 'seller', 'corner'])
@Entity(TABLE.MENU_ORDER)
export class MenuOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  price: number;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  seller: string;

  @Column({ nullable: true })
  corner: string;
}
