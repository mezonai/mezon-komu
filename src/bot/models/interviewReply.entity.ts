import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { TABLE } from '../constants/table';

@Index(['interviewerId', 'timeSendMessage', 'isReply'])
@Entity(TABLE.INTERVIEWER_REPLY)
export class InterviewerReply {
  @PrimaryColumn()
  id: string;

  @Column()
  interviewerId: string;

  @Column({ type: 'text', nullable: true })
  interviewerName: string;

  @Column({ type: 'text', nullable: true })
  interviewerEmail: string;

  @Column({ type: 'text', nullable: true })
  timeSendMessage: string;

  @Column({ nullable: true })
  isReply: boolean;

  @Column({ type: 'text', nullable: true })
  hrEmailProcess: string;
}
