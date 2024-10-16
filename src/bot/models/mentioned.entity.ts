import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.MENTIONED)
export class Mentioned {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  messageId: string;

  @Column({ type: "text", nullable: true })
  authorId: string;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ type: "text", nullable: true })
  mentionUserId: string;

  @Column({ type: "decimal", nullable: true })
  createdTimestamp: number;

  @Column({ nullable: true, default: false })
  noti: boolean;

  @Column({ nullable: true, default: false })
  confirm: boolean;

  @Column({ nullable: true, default: false })
  punish: boolean;

  @Column({ type: "decimal", default: null })
  reactionTimestamp: number;
}
