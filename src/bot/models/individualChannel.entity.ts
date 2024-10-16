import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

@Entity(TABLE.INDIVIDUAL_CHANNEL)
export class IndividualChannel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  channelId: string;

  @Column({ nullable: true })
  channelName: string;

  @Column({ nullable: true })
  ownerUsername: string;

  @Column({ nullable: true })
  ownerId: string;
}
