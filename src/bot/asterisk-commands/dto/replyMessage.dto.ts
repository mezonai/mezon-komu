import {
  ApiMessageAttachment,
  ApiMessageMention,
  ApiMessageRef,
  ChannelMessageContent,
} from 'mezon-sdk';

export interface ReplyMezonMessage {
  clan_id?: string;
  channel_id?: string;
  channelDmId?: string;
  is_public?: boolean;
  is_parent_public?: boolean;
  parent_id?: string;
  mode?: number;
  msg?: ChannelMessageContent;
  mentions?: Array<ApiMessageMention>;
  attachments?: Array<ApiMessageAttachment>;
  ref?: Array<ApiMessageRef>; // user for send message in channel
  userId?: string;
  textContent?: string;
  messOptions?: {
    [x: string]: any;
  };
  refs?: Array<ApiMessageRef>; // user for send message to user
  sender_id?: string;
}

export interface ReactMessageChannel {
  id?: string;
  clan_id: string;
  parent_id?: string;
  channel_id: string;
  mode: number;
  is_public: boolean;
  is_parent_public: boolean;
  message_id: string;
  emoji_id: string;
  emoji: string;
  count: number;
  message_sender_id: string;
  action_delete?: boolean;
}
