import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";
import { EUnlockTimeSheet } from "../constants/configs";

@Index(['messageId', 'userId'])
@Entity(TABLE.UNLOCK_TIMESHEET)
export class UnlockTimeSheet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "text" })
  messageId: string;

  @Column({ type: "text", nullable: true})
  userId: string;

  @Column({ type: "text", nullable: true })
  clanId: string;

  @Column({ type: "text", nullable: true })
  channelId: string;

  @Column({ nullable: true })
  isChannelPublic: boolean;

  @Column({ nullable: true })
  modeMessage: number;

  @Column({ nullable: true })
  payment: number;

  @Column({ type: "text", nullable: true })
  status: EUnlockTimeSheet;

  @Column({ nullable: true })
  amount: number;

  @Column({ type: 'numeric', nullable: true })
  createdAt: number;
}
