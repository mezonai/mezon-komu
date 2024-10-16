import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.TICKER)
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: false })
  title: string;

  @Column({ type: "text", nullable: true })
  desc: string;

  @Column({ type: "text", nullable: false })
  asignee: string;

  @Column({ type: "text", nullable: false })
  creator: string;

  @Column({ type: "text", nullable: true })
  status: string;

  @Column({ type: "decimal", nullable: true })
  createdate: number;

  @Column({ type: "text", nullable: true })
  note: string;
}
