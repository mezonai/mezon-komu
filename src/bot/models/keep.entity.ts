import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.KEEP)
export class Keep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  note: string;

  @Column({ type: "decimal", nullable: true })
  start_time: number;

  @Column({ nullable: true })
  status: string;
}
