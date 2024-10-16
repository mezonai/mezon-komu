import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.CONVERSATION)
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  channelId: string;

  @Column({ nullable: false })
  authorId: string;

  @Column("text", { array: true })
  generated_responses: string[];

  @Column("text", { array: true })
  past_user_inputs: string[];

  @Column({ type: "decimal" })
  createdTimestamp: number;

  @Column({ type: "decimal" })
  updatedTimestamp: number;
}
