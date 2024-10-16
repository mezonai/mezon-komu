import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.IMPORTANT_SMS)
export class ImportantSMS {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: false })
    message: string;

    @Column({ nullable: true, type: "text", array: true })
    users: string[]

    @Column({ nullable: false })
    channelId: string

    @Column({ nullable: true, default: 0, })
    reminder: number

    @Column({ type: "decimal" })
    createdTimestamp: number;
}
