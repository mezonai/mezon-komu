import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.DYNAMIC)
export class Dynamic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  command: string;

  @Column({ type: "text", nullable: true })
  userId: string;

  @Column({ type: "text", nullable: true })
  output: string;
}
