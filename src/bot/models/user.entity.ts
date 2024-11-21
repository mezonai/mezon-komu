import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';

import { TABLE } from '../constants/table';
import { Bwl } from './bwl.entity';
import { BwlReaction } from './bwlReact.entity';
import { Msg } from './msg.entity';
import { TX8 } from './tx8.entity';
import { WorkFromHome } from './wfh.entity';
import { EUserType } from '../constants/configs';

@Index([
  'userId',
  'username',
  'email',
  'user_type',
  'last_message_id',
  'last_bot_message_id',
  'deactive',
  'botPing',
])
@Entity(TABLE.USER)
export class User {
  @PrimaryColumn()
  userId: string;

  @Column({ type: 'text', nullable: true })
  username: string;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  clan_nick: string;

  @OneToMany(() => Msg, (state) => state.author)
  msg: Msg[];

  @OneToMany(() => Bwl, (state) => state.author)
  bwl: Bwl[];

  @OneToMany(() => BwlReaction, (state) => state.author)
  bwlReaction: BwlReaction[];

  @OneToMany(() => TX8, (state) => state.user)
  tx8: TX8[];

  @OneToMany(() => WorkFromHome, (state) => state.user)
  wfh: WorkFromHome[];

  @Column({ type: 'text', nullable: true })
  discriminator: string;

  @Column({ type: 'text', nullable: true })
  avatar: string;

  @Column({ nullable: true })
  bot: boolean;

  @Column({ nullable: true })
  system: boolean;

  @Column({ nullable: true })
  mfa_enabled: boolean;

  @Column({ type: 'text', nullable: true })
  banner: string;

  @Column({ type: 'text', nullable: true })
  accent_color: string;

  @Column({ type: 'text', nullable: true })
  locale: string;

  @Column({ nullable: true })
  verified: boolean;

  @Column({ type: 'text', nullable: true })
  email: string;

  @Column({ nullable: true })
  user_type: EUserType;

  @Column({ nullable: true })
  flags: number;

  @Column({ nullable: true })
  premium_type: number;

  @Column({ nullable: true })
  public_flags: number;

  @Column({ type: 'text', nullable: true })
  last_message_id: string;

  @Column({ type: 'numeric', nullable: true })
  last_message_time: number;

  @Column({ type: 'text', nullable: true })
  last_mentioned_message_id: string;

  @Column({ default: 0 })
  scores_quiz: number;

  @Column('text', { array: true, nullable: true })
  roles: string[];

  @Column({ nullable: true })
  pending_wfh: boolean;

  @Column({ type: 'text', nullable: true })
  last_bot_message_id: string;

  @Column({ nullable: true, default: false })
  deactive: boolean;

  @Column('text', { array: true, nullable: true })
  roles_discord: string[];

  @Column({ default: false })
  botPing: boolean;

  @Column({
    type: 'numeric',
    precision: 30,
    scale: 1,
    nullable: true,
    default: 0,
  })
  scores_workout: number;

  @Column({ default: 0, nullable: true })
  not_workout: number;

  @Column({ type: 'numeric', nullable: true })
  createdAt: number;
}
