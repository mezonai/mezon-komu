import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.REMIND)
export class Remind {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ type: "text", nullable: true })
  mentionUserId: string;

  @Column({ type: "text", nullable: true })
  authorId: string;

  @Column({ type: "text", nullable: true })
  content: string;

  @Column({ nullable: true })
  cancel: boolean;

  @Column({ type: "decimal", nullable: true })
  createdTimestamp: number;
}
