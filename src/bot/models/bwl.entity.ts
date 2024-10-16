import { Column, Entity, JoinColumn, JoinTable, ManyToOne, OneToMany, OneToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";
import { BwlReaction } from "./bwlReact.entity";
import { Channel } from "./channel.entity";
import { User } from "./user.entity";

@Entity(TABLE.BWL)
export class Bwl {
  @PrimaryColumn()
  messageId: string;

  @OneToMany(() => BwlReaction, (state) => state.bwl)
  bwlReaction: BwlReaction[];

  @ManyToOne(() => Channel, (state) => state.bwl)
  @JoinColumn({ name: "channelId" })
  channel: Channel;

  @Column({ type: "text", nullable: true })
  guildId: string;

  @ManyToOne(() => User, (state) => state.bwl)
  @JoinColumn({ name: "authorId" })
  author: User;

  @Column("text", { array: true, nullable: true })
  link: string[];

  @Column({ type: "decimal", nullable: true })
  createdTimestamp: number;
}
