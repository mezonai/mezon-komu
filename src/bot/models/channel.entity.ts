import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  OneToMany,
  PrimaryColumn,
} from "typeorm";

import { TABLE } from "../constants/table";
import { Bwl } from "./bwl.entity";
import { BwlReaction } from "./bwlReact.entity";
import { Msg } from "./msg.entity";

@Entity(TABLE.CHANNEL)
export class Channel {
  @PrimaryColumn()
  id: string;

  @OneToMany(() => Bwl, (state) => state.channel)
  bwl: Bwl[];

  @OneToMany(() => BwlReaction, (state) => state.channel)
  bwlReaction: BwlReaction[];

  @OneToMany(() => Msg, (state) => state.channel)
  msg: Msg[];

  @Column({ type: "text", nullable: true })
  name: string;

  @Column({ type: "text", nullable: true })
  type: string;

  @Column({ type: "boolean", nullable: true })
  nsfw: boolean;

  @Column({ type: "text", nullable: true })
  rawPosition: number;

  @Column({ type: "text", nullable: true })
  lastMessageId: string;

  @Column({ type: "decimal", nullable: true })
  rateLimitPerUser: number;

  @Column({ type: "text", nullable: true })
  parentId: string;
}
