import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { TABLE } from "../constants/table";

const welcome = {
  status: false,
  message: null,
  channel: null,
  image: false,
};
const goodbye = {
  status: false,
  message: null,
  channel: null,
  image: false,
};
const autoping = {
  status: false,
  message: null,
  channel: null,
  image: false,
};

const anti_maj = {
  status: false,
  message: null,
  channel: null,
  image: false,
};
const anti_spam = {
  status: false,
  message: null,
  channel: null,
  image: false,
};

const anti_mentions = {
  status: false,
  message: null,
  channel: null,
  image: false,
};

const anti_dc = {
  status: false,
  message: null,
  channel: null,
  image: false,
};
@Entity(TABLE.GUILDDATA)
export class GuildData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  serverID: string;

  @Column({ nullable: true })
  prefix: string;

  @Column({ nullable: true })
  lang: string;

  @Column({ default: false, nullable: true })
  premium: string;

  @Column({ default: false, nullable: true })
  premiumUserID: string;

  @Column({ default: false, nullable: true })
  chatbot: string;

  @Column({ default: false, nullable: true })
  ignored_channel: string;

  @Column({ default: false, nullable: true })
  admin_role: string;

  @Column({ default: false, nullable: true })
  goodPremium: string;

  @Column({ default: false, nullable: true })
  requestChannel: string;

  @Column({ default: false, nullable: true })
  requestMessage: string;

  @Column({ default: false, nullable: true })
  defaultVolume: string;

  @Column({ default: false, nullable: true })
  vc: string;

  @Column({ default: false, nullable: true })
  clearing: string;

  @Column({ default: false, nullable: true })
  auto_shuffle: string;

  @Column({ default: false, nullable: true })
  games_enabled: string;

  @Column({ default: false, nullable: true })
  util_enabled: string;

  @Column({ default: false, nullable: true })
  autorole: string;

  @Column({ default: false, nullable: true })
  autorole_bot: string;

  @Column({ default: false, nullable: true })
  dj_role: string;

  @Column({ default: false, nullable: true })
  count: string;

  @Column({ default: false, nullable: true })
  autopost: string;

  @Column({ default: false, nullable: true })
  suggestions: string;

  @Column({ default: false, nullable: true })
  color: string;

  @Column({ default: false, nullable: true })
  backlist: string;

  @Column({ default: false, nullable: true })
  autonick: string;

  @Column({ default: false, nullable: true })
  autonick_bot: string;

  @Column({ default: false, nullable: true })
  autoplay: string;

  @Column({ default: null, nullable: true })
  song: string;

  @Column({ default: null, nullable: true })
  h24: string;

  @Column({ default: true, nullable: true })
  announce: string;

  @Column({ default: { welcome, goodbye, autoping } })
  plugins: string;

  @Column({
    default: {
      anti_maj,
      anti_spam,
      anti_mentions,
      anti_dc,
      anti_pub: null,
      antiraid_logs: null,
    },
  })
  protections: string;
}
