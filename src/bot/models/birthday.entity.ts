import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TABLE } from '../constants/table';

@Entity(TABLE.BIRTHDAY)
export class BirthDay {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;
}
