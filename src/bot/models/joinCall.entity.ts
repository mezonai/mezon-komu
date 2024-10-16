import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.JOIN_CALL)
export class JoinCall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ type: "text", nullable: true })
  userId: string;

  @Column({ type: "text", nullable: true })
  status: string;

  @Column({ type: "decimal", nullable: true })
  start_time: number;

  @Column({ type: "decimal", nullable: true })
  end_time: number;
}
