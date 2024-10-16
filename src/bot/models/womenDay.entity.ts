import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.WOMENDAY)
export class WomenDay {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text" })
  userId: string;

  @Column({ type: "boolean" })
  win: boolean;

  @Column({ type: "text" })
  gift: string;
}
