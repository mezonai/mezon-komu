import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.NEWS)
export class News {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text" })
  title: string;

  @Column({ type: "text" })
  link: string;

  @Column({ type: "decimal" })
  pubDate: number;

  @Column({ type: "text" })
  urlImage: string;

  @Column({ type: "text" })
  contentSnippet: string;
}