import { number } from "@hapi/joi";
import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Index(['userId', 'username', 'channelId'])
@Entity(TABLE.PENATLY)
export class Penalty {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  userId: string;

  @Column({ type: "text", nullable: true })
  username: string;

  @Column({ type: "numeric", nullable: true, precision: 30 })
  ammount: number;

  @Column({ type: "text", nullable: true })
  reason: string;

  @Column({ type: "decimal", nullable: true })
  createdTimestamp: number;

  @Column({ type: "boolean", nullable: true })
  isReject: boolean;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ type: "boolean", nullable: true })
  delete: boolean;
}
