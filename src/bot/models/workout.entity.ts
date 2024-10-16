import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.WORKOUT)
export class Workout {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  userId: string;

  @Column({ type: "text", nullable: true })
  email: string;

  @Column({ type: "text", nullable: true })
  status: string;

  @Column({ nullable: true, default: false })
  attachment: boolean;

  @Column({ nullable: true, default: false })
  channelId: string;

  @Column({ type: "decimal", nullable: true })
  createdTimestamp: number;

  @Column({
    type: "numeric",
    precision: 30,
    scale: 1,
    nullable: true,
    default: 0,
  })
  point: number;
}
