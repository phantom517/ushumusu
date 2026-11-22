import { AvatarInfo } from './profile';

/** A "play with me" invite riding inside a chat message. */
export interface ChatInvite {
  inviteId: string;
  gameId: string;
  status: 'pending' | 'accepted' | 'declined';
}

/**
 * Ephemeral couple chat. Messages live in memory on the server and are
 * pruned after CHAT_CONFIG.TTL_MS — no persistence anywhere.
 */
export interface ChatMessage {
  id: string;
  kind: 'text' | 'system' | 'invite';
  /** Session token of the sender (system messages: the subject's session). */
  sessionId: string;
  displayName: string;
  text: string;
  sentAt: number;
  /** Present when kind === 'invite'. */
  invite?: ChatInvite;
}

export type ChatSendAck = { success: boolean; error?: string };

export type ChatOpenAck = {
  success: boolean;
  messages: ChatMessage[];
  partnerOnline: boolean;
  partnerName: string | null;
  partnerAvatar: AvatarInfo | null;
  error?: string;
};

export type ChatCloseAck = { success: boolean; error?: string };

export type ChatAvatarAck = { success: boolean; avatar?: AvatarInfo; error?: string };

export type ChatInviteUpdateEvent = {
  inviteId: string;
  status: 'accepted' | 'declined';
  bySessionId: string;
  byName: string;
};

export type ChatInviteAcceptedEvent = {
  gameId: string;
  bySessionId: string;
  byName: string;
};
