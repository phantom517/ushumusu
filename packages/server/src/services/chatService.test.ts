import { describe, test, expect, beforeEach } from 'bun:test';
import { chatService } from './chatService';
import { memoryStore } from '../storage/memoryStore';
import { ConnectedPlayer, CHAT_CONFIG, ChatMessage, AVATAR_PRESETS } from '@tether/shared';

/** Capturing fake socket server — records every emit per socket. */
function makeFakeIo() {
  const emits: Array<{ socketId: string; event: string; payload: any }> = [];
  const io: any = {
    to: (socketId: string) => ({
      emit: (event: string, payload: any) => {
        emits.push({ socketId, event, payload });
      },
    }),
  };
  return { io, emits };
}

const SECRET = 'tether-duo-secret';

function seedPlayer(sessionId: string, socketId: string, secret: string = SECRET): ConnectedPlayer {
  const player: ConnectedPlayer = {
    sessionId,
    profile: {
      id: `profile-${sessionId}`,
      displayName: sessionId.replace('sess-', ''),
      avatar: { type: 'icon', value: 'avatar-heartie' },
      pairingSecret: secret,
    },
    socketId,
    connectedAt: Date.now(),
    lastActiveAt: Date.now(),
    isOnline: true,
  };
  memoryStore.players.set(sessionId, player);
  return player;
}

describe('chatService (ephemeral couple chat)', () => {
  beforeEach(() => {
    memoryStore.players.clear();
    chatService.clearEphemeralState();
    // Drain channels between tests by sweeping far into the future
    chatService.sweep(Date.now() + CHAT_CONFIG.TTL_MS * 2);
  });

  test('text messages are stored and broadcast to the whole couple', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    const res = chatService.sendText(a, '  hi love  ');
    expect(res.success).toBe(true);

    const chatMsgs = emits.filter((e) => e.event === 'chat:message');
    expect(chatMsgs).toHaveLength(2); // both partners receive it
    const message: ChatMessage = chatMsgs[0].payload.message;
    expect(message.text).toBe('hi love');
    expect(message.kind).toBe('text');
    expect(message.sessionId).toBe('sess-anna');
    expect(message.displayName).toBe('anna');
  });

  test('empty and oversized texts are rejected', () => {
    const a = seedPlayer('sess-anna', 'socket-a');
    expect(chatService.sendText(a, '   ').success).toBe(false);
    expect(chatService.sendText(a, 'x'.repeat(CHAT_CONFIG.MAX_TEXT_LEN + 1)).success).toBe(false);
    expect(chatService.sendText(a, 'fine').success).toBe(true);
  });

  test('couples with different secrets never see each other', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a', 'secret-duo-1');
    seedPlayer('sess-solo', 'socket-c', 'secret-duo-2');

    chatService.sendText(a, 'private whisper');
    const chatMsgs = emits.filter((e) => e.event === 'chat:message');
    expect(chatMsgs).toHaveLength(1); // only the sender's own channel
    expect(chatMsgs[0].socketId).toBe('socket-a');
  });

  test('messages expire after the TTL and the channel empties out', () => {
    const a = seedPlayer('sess-anna', 'socket-a');
    chatService.sendText(a, 'will vanish');

    // Fast-forward past the TTL
    const future = Date.now() + CHAT_CONFIG.TTL_MS + 1000;
    const removed = chatService.sweep(future);
    expect(removed).toBeGreaterThan(0);

    const open = chatService.open(a);
    // The fresh "joined the chat" line is stored for the partner but never
    // echoed into your own history — so you see an empty room.
    expect(open.messages).toHaveLength(0);
  });

  test('channel history is capped', () => {
    const a = seedPlayer('sess-anna', 'socket-a');
    for (let i = 0; i < CHAT_CONFIG.MAX_CHANNEL_MESSAGES + 30; i++) {
      chatService.sendText(a, `msg ${i}`);
    }
    const open = chatService.open(a);
    expect(open.messages.length).toBeLessThanOrEqual(CHAT_CONFIG.MAX_CHANNEL_MESSAGES);
  });

  test('open returns history, partner presence and a join system line for the partner', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    chatService.sendText(a, 'before you looked');
    const open = chatService.open(a);
    expect(open.partnerOnline).toBe(true);
    expect(open.partnerName).toBe('noor');
    expect(open.partnerAvatar).toEqual({ type: 'icon', value: 'avatar-heartie' });
    // history contains the text message (the join line is broadcast, not stored for self-view? it IS stored)
    expect(open.messages.some((m) => m.kind === 'text' && m.text === 'before you looked')).toBe(true);

    // The partner got a system line "anna joined the chat"
    const sys = emits.filter((e) => e.event === 'chat:message' && e.payload.message.kind === 'system');
    expect(sys.some((e) => e.socketId === 'socket-b' && e.payload.message.text === 'joined the chat')).toBe(true);
    expect(sys.some((e) => e.socketId === 'socket-a')).toBe(false); // actor never sees own join
  });

  test('own join/leave lines stay out of your history but reach the partner', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    const b = seedPlayer('sess-noor', 'socket-b');

    // Anna opens, leaves, then looks at her history
    chatService.open(a);
    chatService.close(a);
    const annaView = chatService.open(a);
    expect(annaView.messages.filter((m) => m.kind === 'system' && m.sessionId === 'sess-anna')).toHaveLength(0);

    // But Noor's history shows Anna's join/leave lines
    chatService.open(b);
    const noorView = chatService.open(b);
    const annaLines = noorView.messages.filter((m) => m.kind === 'system' && m.sessionId === 'sess-anna');
    expect(annaLines.some((m) => m.text === 'joined the chat')).toBe(true);
    expect(annaLines.some((m) => m.text === 'left the chat')).toBe(true);
    // ...and Noor never sees her own lines
    expect(noorView.messages.filter((m) => m.kind === 'system' && m.sessionId === 'sess-noor')).toHaveLength(0);
  });

  test('rapid open/close does not spam the channel with system lines', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    chatService.open(a);
    chatService.close(a);
    chatService.open(a);
    chatService.close(a);
    chatService.open(a);

    const joined = emits.filter(
      (e) => e.socketId === 'socket-b' && e.event === 'chat:message' && e.payload.message.text === 'joined the chat'
    );
    const left = emits.filter(
      (e) => e.socketId === 'socket-b' && e.event === 'chat:message' && e.payload.message.text === 'left the chat'
    );
    expect(joined.length).toBe(1); // throttled within the 60s window
    expect(left.length).toBe(1);
    expect(chatService.sendText(a, 'still works').success).toBe(true);
  });

  test('game invites are stored and echo to the sender AND the partner', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    expect(chatService.sendInvite(a, 'delta-drill').success).toBe(true);

    const invites = emits.filter((e) => e.event === 'chat:message' && e.payload.message.kind === 'invite');
    expect(invites).toHaveLength(2); // sender echo + partner
    const message: ChatMessage = invites[0].payload.message;
    expect(message.invite?.gameId).toBe('delta-drill');
    expect(message.invite?.status).toBe('pending');
    expect(message.displayName).toBe('anna');

    // Locked and unknown games are rejected
    expect(chatService.sendInvite(a, 'memory-lane').success).toBe(false);
    expect(chatService.sendInvite(a, 'made-up-game').success).toBe(false);
  });

  test('accepting an invite flips both cards and sends the inviter to matchmaking', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    const b = seedPlayer('sess-noor', 'socket-b');

    chatService.sendInvite(a, 'delta-drill');
    const inviteId = emits.find((e) => e.event === 'chat:message' && e.socketId === 'socket-b')!.payload.message
      .invite.inviteId;
    emits.length = 0;

    // Anna tries to accept her own invite — nope
    expect(chatService.respondInvite(a, inviteId, true).success).toBe(false);

    // Noor accepts for real
    expect(chatService.respondInvite(b, inviteId, true).success).toBe(true);

    const updates = emits.filter((e) => e.event === 'chat:invite:update');
    expect(updates).toHaveLength(2); // both partners see the flip
    expect(updates.every((e) => e.payload.status === 'accepted')).toBe(true);

    const accepted = emits.filter((e) => e.event === 'chat:invite:accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].socketId).toBe('socket-a'); // inviter only
    expect(accepted[0].payload.gameId).toBe('delta-drill');

    // The stored card now reads accepted (visible in the inviter's history)
    const open = chatService.open(a);
    expect(open.messages.some((m) => m.kind === 'invite' && m.invite?.status === 'accepted')).toBe(true);

    // Double answers and unknown invites are rejected
    expect(chatService.respondInvite(b, inviteId, false).success).toBe(false);
    expect(chatService.respondInvite(b, 'it-nope', true).success).toBe(false);
  });

  test('declining an invite marks the card declined and never navigates anyone', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    const b = seedPlayer('sess-noor', 'socket-b');

    chatService.sendInvite(a, 'syntax-duel');
    const inviteId = emits.find((e) => e.event === 'chat:message' && e.socketId === 'socket-b')!.payload.message
      .invite.inviteId;
    emits.length = 0;

    expect(chatService.respondInvite(b, inviteId, false).success).toBe(true);

    const updates = emits.filter((e) => e.event === 'chat:invite:update');
    expect(updates.every((e) => e.payload.status === 'declined')).toBe(true);
    expect(emits.some((e) => e.event === 'chat:invite:accepted')).toBe(false);

    const open = chatService.open(b);
    expect(open.messages.some((m) => m.kind === 'invite' && m.invite?.status === 'declined')).toBe(true);
  });

  test('typing indicator reaches the partner but never the sender', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    chatService.typingToPartner(a, true);
    const typing = emits.filter((e) => e.event === 'chat:typing');
    expect(typing).toHaveLength(1);
    expect(typing[0].socketId).toBe('socket-b');
    expect(typing[0].payload.typing).toBe(true);
  });

  test('avatar picker updates the session profile and notifies the partner', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    const res = chatService.setAvatar(a, 'photo-03');
    expect(res.success).toBe(true);
    expect(res.avatar).toEqual({ type: 'photo', value: 'photo-03' });
    expect(a.profile.avatar).toEqual({ type: 'photo', value: 'photo-03' });

    const avatars = emits.filter((e) => e.event === 'partner:avatar');
    expect(avatars).toHaveLength(1);
    expect(avatars[0].socketId).toBe('socket-b'); // partner only

    expect(chatService.setAvatar(a, 'photo-nope').success).toBe(false);
  });

  test('icon avatar picks store the glyph value the UI expects', () => {
    const a = seedPlayer('sess-anna', 'socket-a');
    const heartie = AVATAR_PRESETS.find((p) => p.id === 'avatar-heartie')!;

    const res = chatService.setAvatar(a, 'avatar-heartie');
    expect(res.success).toBe(true);
    expect(res.avatar).toEqual({ type: 'icon', value: heartie.value });
  });

  test('presence reflects whether the other half of the couple is online', () => {
    const { io, emits } = makeFakeIo();
    chatService.setSocketServer(io);
    const a = seedPlayer('sess-anna', 'socket-a');
    seedPlayer('sess-noor', 'socket-b');

    chatService.broadcastPresence('tether-duo-secret');
    const presences = emits.filter((e) => e.event === 'chat:presence');
    expect(presences).toHaveLength(2);
    for (const p of presences) {
      expect(p.payload.partnerOnline).toBe(true);
      const expectedPartner = p.socketId === 'socket-a' ? 'noor' : 'anna';
      expect(p.payload.partnerName).toBe(expectedPartner);
    }

    // Partner goes offline
    memoryStore.players.get('sess-noor')!.isOnline = false;
    emits.length = 0;
    chatService.broadcastPresence('tether-duo-secret');
    const after = emits.filter((e) => e.event === 'chat:presence');
    expect(after).toHaveLength(1); // only anna still online
    expect(after[0].payload.partnerOnline).toBe(false);
  });
});
