import { create } from 'zustand';
import { ChatMessage, AvatarInfo } from '@tether/shared';

interface ChatState {
  /** Text + system messages for this couple's channel (newest last). */
  messages: ChatMessage[];
  partnerTyping: boolean;
  partnerOnline: boolean;
  partnerName: string | null;
  partnerAvatar: AvatarInfo | null;
  /** This phone's session token — used to split "mine" vs "theirs" bubbles. */
  ownSessionId: string | null;
  setOwnSessionId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setPartnerTyping: (typing: boolean) => void;
  setPresence: (presence: { partnerOnline: boolean; partnerName: string | null }) => void;
  setPartnerAvatar: (avatar: AvatarInfo) => void;
  updateInviteStatus: (inviteId: string, status: 'accepted' | 'declined') => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  partnerTyping: false,
  partnerOnline: false,
  partnerName: null,
  partnerAvatar: null,
  ownSessionId: null,

  setOwnSessionId: (ownSessionId) => set({ ownSessionId }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => {
      // Broadcasts echo to the sender too — dedupe by id.
      if (state.messages.some((m) => m.id === message.id)) return state;
      return { messages: [...state.messages, message], partnerTyping: false };
    }),

  setPartnerTyping: (partnerTyping) => set({ partnerTyping }),

  setPresence: (presence) =>
    set({ partnerOnline: presence.partnerOnline, partnerName: presence.partnerName }),

  setPartnerAvatar: (partnerAvatar) => set({ partnerAvatar }),

  updateInviteStatus: (inviteId, status) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.kind === 'invite' && m.invite?.inviteId === inviteId
          ? { ...m, invite: { ...m.invite, status } }
          : m
      ),
    })),

  reset: () =>
    set({
      messages: [],
      partnerTyping: false,
      partnerOnline: false,
      partnerName: null,
      partnerAvatar: null,
      ownSessionId: null,
    }),
}));
