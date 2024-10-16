import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.ORDER)
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  userId: string;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ type: "text", nullable: true })
  menu: string;

  @Column({ type: "text", nullable: true })
  username: string;

  @Column({ type: "boolean", default: false })
  isCancel: boolean;

  @Column({ type: "decimal" })
  createdTimestamp: number;
}
