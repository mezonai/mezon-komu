import { Injectable } from '@nestjs/common';
import { ChannelMessage } from 'mezon-sdk';

interface PollState {
  pollMessageId: string;
  clanId: string;
  channelId: string;
  messageCountAfter: number;
  expired: boolean;
}

@Injectable()
export class PollTrackerService {
  private pollsByMessageId = new Map<string, PollState>();

  private pollsByChannel = new Map<string, Set<string>>();

  private makeChannelKey(clanId: string, channelId: string) {
    return `${clanId}:${channelId}`;
  }

  startTrackPoll(clanId: string, channelId: string, pollMessageId: string) {
    const state: PollState = {
      pollMessageId,
      clanId,
      channelId,
      messageCountAfter: 0,
      expired: false,
    };

    this.pollsByMessageId.set(pollMessageId, state);

    const key = this.makeChannelKey(clanId, channelId);
    const set = this.pollsByChannel.get(key) ?? new Set<string>();
    set.add(pollMessageId);
    this.pollsByChannel.set(key, set);
  }

  handleNewMessage(
    clanId: string,
    channelId: string,
    newMessageId: string,
    message: ChannelMessage,
  ) {
    const key = this.makeChannelKey(clanId, channelId);
    const set = this.pollsByChannel.get(key);
    if (!set || set.size === 0) return;
    for (const pollMessageId of set) {
      const state = this.pollsByMessageId.get(pollMessageId);
      if (!state || state.expired) continue;

      if (state.pollMessageId === newMessageId) continue;

      if (!!message.content.embed || !!message.attachments.length) {
        state.messageCountAfter += 3;
      } else if (message.content.t?.length > 200) {
        state.messageCountAfter += 2;
      } else {
        state.messageCountAfter += 1;
      }

      if (state.messageCountAfter > 4) {
        state.expired = true;
      }

      this.pollsByMessageId.set(pollMessageId, state);
    }
  }

  getPollState(pollMessageId: string): PollState | undefined {
    return this.pollsByMessageId.get(pollMessageId);
  }

  stopTrackPoll(pollMessageId: string) {
    const state = this.pollsByMessageId.get(pollMessageId);
    if (!state) return;

    this.pollsByMessageId.delete(pollMessageId);

    const key = this.makeChannelKey(state.clanId, state.channelId);
    const set = this.pollsByChannel.get(key);
    if (set) {
      set.delete(pollMessageId);
      if (set.size === 0) this.pollsByChannel.delete(key);
    }
  }
}
