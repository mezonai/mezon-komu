import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Index(['id', 'role', 'isVerify', 'accept'])
@Entity(TABLE.QUESTION)
export class Quiz {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text", nullable: true })
  title: string;

  @Column("text", { array: true, nullable: true })
  options: string[];

  @Column({ type: "text", nullable: true })
  correct: string;

  @Column({ type: "text", nullable: true })
  role: string;

  @Column()
  isVerify: boolean;

  @Column()
  accept: boolean;

  @Column({ type: "text", nullable: true })
  author_email: string;

  @Column({ type: "text", nullable: true })
  topic: string;
}
