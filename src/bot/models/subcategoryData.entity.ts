import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Entity(TABLE.SUBCATEGORYS)
export class Subcategorys{
  @PrimaryGeneratedColumn()
  id: number;

  @Column({})
  title: string;
 
}

