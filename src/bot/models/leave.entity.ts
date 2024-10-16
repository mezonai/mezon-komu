import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.LEAVE)
export class Leave {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text" })
  channelId: string;

  @Column({ type: "text" })
  userId: string;

  @Column({ type: "text" })
  reason: string;

  @Column({ type: "decimal" })
  minute: number;

  @Column({ type: "date", nullable : true })
  createdAt: Date;
}
