import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.HOLIDAY)
export class Holiday {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text" })
  dateTime: string;

  @Column({ type: "text" })
  content: string;
}
