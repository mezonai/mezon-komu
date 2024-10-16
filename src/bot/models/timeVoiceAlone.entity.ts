import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.TIME_VOICE_ALONE)
export class TimeVoiceAlone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: false })
  channelId: string;

  @Column({ nullable: false })
  status: boolean;

  @Column({ type: "decimal", nullable: false })
  start_time: number;
}
