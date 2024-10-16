import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.DAILY)
export class Daily {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userid: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  daily: string;

  @Column({ type: "decimal", nullable: true })
  createdAt: number;

  @Column({ nullable: true })
  channelid: string;
}
