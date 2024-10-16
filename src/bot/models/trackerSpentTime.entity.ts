import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.TRACKER_SPENT_TIME)
export class TrackerSpentTime {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  email: string;

  @Column({ type: "numeric", precision: 30, scale: 3, nullable: true })
  spent_time: number;

  @Column({ type: "text", nullable: true })
  date: string;

  @Column({ type: "numeric", precision: 30, scale: 3, nullable: true })
  call_time: number;

  @Column({ type: "boolean", nullable: true })
  wfh: boolean;

  @Column({ nullable: true, type: "text" })
  active_time: string;
}
