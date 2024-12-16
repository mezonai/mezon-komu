import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TABLE } from '../constants/table';
import { ERequestAbsenceDayStatus, ERequestAbsenceType, ERequestAbsenceDateType, ERequestAbsenceTime } from '../constants/configs';

@Entity(TABLE.ABSENCE_DAY_REQUEST)
export class AbsenceDayRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  messageId: string;

  @Column({ type: 'text', nullable: true })
  userId: string;

  @Column({ type: 'text', nullable: true })
  clanId: string;

  @Column({ type: 'text', nullable: true })
  channelId: string;

  @Column({ nullable: true })
  isChannelPublic: boolean;

  @Column({ nullable: true })
  modeMessage: number;

  @Column({ type: 'text', nullable: true })
  status: ERequestAbsenceDayStatus;

  @Column({ type: 'text', nullable: true })
  type: ERequestAbsenceType;

  @Column({ type: 'text', nullable: true })
  dateType: ERequestAbsenceDateType;

  @Column({ type: 'text', nullable: true })
  absenceTime: ERequestAbsenceTime;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'numeric', nullable: true })
  createdAt: number;

  @Column({ type: 'numeric', nullable: true })
  requestId: number;
}
