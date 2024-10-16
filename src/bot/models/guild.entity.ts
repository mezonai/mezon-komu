import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.GUILD)
export class Guild {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  serverID: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: false })
  content: string;

  @Column({ default: false })
  reason: string;
}
