import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.WOL)
export class WOL {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: false })
    author: string;

    @Column({ nullable: true })
    wol: string;

    @Column({ nullable: true, type: "decimal", default: Date.now() })
    createAt: number;
}
