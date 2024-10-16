import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.WELCOME)
export class Welcome {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false, type: "text" })
  serverID: string;

  @Column({ nullable: false, type: "text" })
  channelID: string;

  @Column({ nullable: true, type: "text" })
  image: string;

  @Column({ nullable: true, type: "text" })
  message: string;

  @Column({ nullable: true, type: "text" })
  status: string;

  @Column({ nullable: true, type: "text" })
  embed: string;

  @Column({ nullable: false, type: "text" })
  reason: string;

  @Column({ nullable: true, type: "text" })
  color: string;
}
