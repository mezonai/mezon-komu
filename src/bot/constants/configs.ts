export const BOT_ID = process.env.BOT_KOMU_ID;

export const EMAIL_DOMAIN = 'ncc.asia';

export enum EUserType {
  DISCORD = 'DISCORD',
  MEZON = 'MEZON',
}

export enum EMessageMode {
  CHANNEL_MESSAGE = 2,
  DM_MESSAGE = 4,
  THREAD_MESSAGE = 6,
}

export enum FileType {
  NCC8 = 'ncc8',
  FILM = 'film',
  AUDIOBOOK = 'audioBook',
}

export enum FFmpegImagePath {
  NCC8 = '/dist/public/images/ncc8.png',
  AUDIOBOOK = '/dist/public/images/audiobook.png',
}

export enum ErrorSocketType {
  TIME_OUT = 'The socket timed out while waiting for a response.',
  NOT_ESTABLISHED = 'Socket connection has not been established yet.',
}

export enum DynamicCommandType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
}
