import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

import { TABLE } from "../constants/table";

@Entity(TABLE.COMPANYTRIP)
export class CompanyTrip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  year: string;

  @Column({ nullable: false })
  fullName: string;

  @Column({ nullable: false })
  userId: string;

  @Column({ nullable: false })
  email: string;

  @Column({ nullable: false })
  phone: string;

  @Column({ nullable: false })
  office: string;

  @Column({ nullable: false })
  role: string;

  @Column({ nullable: false })
  kingOfRoom: string;

  @Column({ nullable: false })
  room: string;
}
