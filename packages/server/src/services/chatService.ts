import { Server as SocketIOServer } from 'socket.io';
import {
  CHAT_CONFIG,
  ChatMessage,
  AvatarInfo,
  ConnectedPlayer,
  findAvatarPreset,
  AVAILABLE_GAMES,
  PLAYABLE_GAME_IDS,
} from '@tether/shared';
import { memoryStore } from '../storage/memoryStore';

const CHANNEL_DEFAULT = 'default';

/**
 * Ephemeral couple chat, scoped by the pair's shared pairingSecret.
 * Messages live ONLY in memory and are pruned after 15 minutes — both by
 * a periodic sweep and lazily on every access. No persistence anywhere.
 */
class ChatService {
  private io: SocketIOServer | null = null;
  private channels = new Map<string, ChatMessage[]>();
  private typing = new Map<string, Set<string>>(); // channel -> sessionIds currently typing
  private sweeper: ReturnType<typeof setInterval> | null = null;
  /** Anti-spam: last time a given actor emitted a given system line. */
  private systemThrottle = new Map<string, number>();
  private static SYSTEM_THROTTLE_MS = 60_000;

  public setSocketServer(io: SocketIOServer): void {
    this.io = io;
    if (!this.sweeper) {
      this.sweeper = setInterval(() => this.sweep(), CHAT_CONFIG.PRUNE_INTERVAL_MS);
      this.sweeper.unref?.();
    }
  }

  private channelOf(secret: string | undefined): string {
    const clean = (secret || '').trim().toLowerCase();
    return clean || CHANNEL_DEFAULT;
  }

  /** All ONLINE sessions that share the couple's channel. */
  private onlineSessions(channel: string): ConnectedPlayer[] {
    const found: ConnectedPlayer[] = [];
    for (const player of memoryStore.players.values()) {
      if (!player.isOnline) continue;
      if (this.channelOf(player.profile.pairingSecret) !== channel) continue;
      found.push(player);
    }
    return found;
  }

  private emitToChannel(channel: string, event: string, payload: any, excludeSessionId?: string): void {
    if (!this.io) return;
    for (const player of this.onlineSessions(channel)) {
      if (excludeSessionId && player.sessionId === excludeSessionId) continue;
      this.io.to(player.socketId).emit(event, payload);
    }
  }

  /** Drop expired messages; prune empty channels. Returns pruned count. */
  public sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [channel, messages] of this.channels) {
      const alive = messages.filter((m) => now - m.sentAt < CHAT_CONFIG.TTL_MS);
      if (alive.length !== messages.length) removed += messages.length - alive.length;
      if (alive.length === 0) this.channels.delete(channel);
      else this.channels.set(channel, alive);
    }
    return removed;
  }

  /** Stores a message (pruned + capped) and broadcasts it to the couple. */
  private commit(channel: string, message: ChatMessage, excludeSessionId?: string): void {
    this.sweep();
    const list = this.channels.get(channel) ?? [];
    list.push(message);
    while (list.length > CHAT_CONFIG.MAX_CHANNEL_MESSAGES) list.shift();
    this.channels.set(channel, list);
    this.emitToChannel(channel, 'chat:message', { message }, excludeSessionId);
  }

  /** A partner invites the other to play a game right now. */
  public sendInvite(player: ConnectedPlayer, gameId: string): { success: boolean; error?: string } {
    const game = AVAILABLE_GAMES.find((g) => g.id === gameId);
    if (!game) return { success: false, error: 'Unknown game' };
    if (!PLAYABLE_GAME_IDS.includes(gameId)) {
      return { success: false, error: `${game.name} is coming soon` };
    }
    const channel = this.channelOf(player.profile.pairingSecret);
    const now = Date.now();
    // Broadcast to the whole couple (including the sender's own echo).
    this.commit(channel, {
      id: `inv-${now}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'invite',
      sessionId: player.sessionId,
      displayName: player.profile.displayName,
      text: game.name,
      sentAt: now,
      invite: {
        inviteId: `it-${now}-${Math.random().toString(36).slice(2, 8)}`,
        gameId,
        status: 'pending',
      },
    });
    return { success: true };
  }

  /** The other half answers an invite. Accepting tells the inviter to jump in. */
  public respondInvite(
    player: ConnectedPlayer,
    inviteId: string,
    accept: boolean
  ): { success: boolean; error?: string } {
    this.sweep();
    const channel = this.channelOf(player.profile.pairingSecret);
    const list = this.channels.get(channel) ?? [];
    const message = [...list].reverse().find((m) => m.kind === 'invite' && m.invite?.inviteId === inviteId);
    if (!message || !message.invite) {
      return { success: false, error: 'Invite not found — it may have vanished' };
    }
    if (message.sessionId === player.sessionId) {
      return { success: false, error: 'That is your own invite' };
    }
    if (message.invite.status !== 'pending') {
      return { success: false, error: 'Invite already answered' };
    }

    const status = accept ? ('accepted' as const) : ('declined' as const);
    message.invite = { ...message.invite, status };

    // Both cards flip to the new state…
    this.emitToChannel(channel, 'chat:invite:update', {
      inviteId,
      status,
      bySessionId: player.sessionId,
      byName: player.profile.displayName,
    });

    // …and on accept, the inviter (everyone except the responder) jumps to matchmaking.
    if (accept) {
      this.emitToChannel(
        channel,
        'chat:invite:accepted',
        {
          gameId: message.invite.gameId,
          bySessionId: player.sessionId,
          byName: player.profile.displayName,
        },
        player.sessionId
      );
    }
    return { success: true };
  }

  /** Test hook — clears throttle/typing state between test cases. */
  public clearEphemeralState(): void {
    this.systemThrottle.clear();
    this.typing.clear();
  }

  /** A partner typed a chat message. */
  public sendText(player: ConnectedPlayer, rawText: string): { success: boolean; error?: string } {
    const text = (rawText || '').trim();
    if (!text) return { success: false, error: 'Message is empty' };
    if (text.length > CHAT_CONFIG.MAX_TEXT_LEN) {
      return { success: false, error: `Keep it under ${CHAT_CONFIG.MAX_TEXT_LEN} characters` };
    }
    const channel = this.channelOf(player.profile.pairingSecret);
    this.commit(channel, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'text',
      sessionId: player.sessionId,
      displayName: player.profile.displayName,
      text,
      sentAt: Date.now(),
    });
    return { success: true };
  }

  /** System line, e.g. "Noor joined the chat" — shown to the partner only.
   *  Throttled so quickly toggling the screen doesn't spam the channel. */
  public addSystem(player: ConnectedPlayer, verb: string): void {
    const channel = this.channelOf(player.profile.pairingSecret);
    const key = `${channel}|${player.sessionId}|${verb}`;
    const now = Date.now();
    const last = this.systemThrottle.get(key);
    if (last && now - last < ChatService.SYSTEM_THROTTLE_MS) return;
    this.systemThrottle.set(key, now);
    this.commit(
      channel,
      {
        id: `sys-${now}-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'system',
        sessionId: player.sessionId,
        displayName: player.profile.displayName,
        text: verb,
        sentAt: now,
      },
      player.sessionId
    );
  }

  /** Opening the chat: history + who's around + a join line for the partner. */
  public open(player: ConnectedPlayer): {
    messages: ChatMessage[];
    partnerOnline: boolean;
    partnerName: string | null;
    partnerAvatar: AvatarInfo | null;
  } {
    this.sweep();
    const channel = this.channelOf(player.profile.pairingSecret);
    const others = this.onlineSessions(channel).filter((p) => p.sessionId !== player.sessionId);
    const partnerOnline = others.length > 0;
    this.addSystem(player, 'joined the chat');
    this.broadcastPresence(channel);
    // Your own join/leave lines are stored (the partner sees them) but never
    // shown back to you — "You joined the chat" is noise, not history.
    return {
      messages: (this.channels.get(channel) ?? []).filter(
        (m) => !(m.kind === 'system' && m.sessionId === player.sessionId)
      ),
      partnerOnline,
      partnerName: partnerOnline ? others[0].profile.displayName : null,
      partnerAvatar: partnerOnline ? others[0].profile.avatar : null,
    };
  }

  public close(player: ConnectedPlayer): void {
    this.addSystem(player, 'left the chat');
    const channel = this.channelOf(player.profile.pairingSecret);
    const typingSet = this.typing.get(channel);
    typingSet?.delete(player.sessionId);
    this.emitToChannel(channel, 'chat:typing', { sessionId: player.sessionId, typing: false });
  }

  /** Relay the typing indicator to the partner only. */
  public typingToPartner(player: ConnectedPlayer, isTyping: boolean): void {
    const channel = this.channelOf(player.profile.pairingSecret);
    let set = this.typing.get(channel);
    if (!set) {
      set = new Set();
      this.typing.set(channel, set);
    }
    if (isTyping) set.add(player.sessionId);
    else set.delete(player.sessionId);
    this.emitToChannel(channel, 'chat:typing', { sessionId: player.sessionId, typing: isTyping }, player.sessionId);
  }

  /** Tell everyone in the couple whether their person is around. */
  public broadcastPresence(channel: string): void {
    if (!this.io) return;
    const online = this.onlineSessions(channel);
    for (const me of online) {
      const partner = online.find((p) => p.sessionId !== me.sessionId);
      this.io.to(me.socketId).emit('chat:presence', {
        partnerOnline: Boolean(partner),
        partnerName: partner?.profile.displayName ?? null,
      });
    }
  }

  /** Profile photo change — updates the session profile + tells the partner. */
  public setAvatar(player: ConnectedPlayer, avatarId: string): { success: boolean; avatar?: AvatarInfo; error?: string } {
    const preset = findAvatarPreset(avatarId);
    if (!preset) return { success: false, error: 'Unknown avatar' };

    const avatar: AvatarInfo =
      preset.type === 'photo' ? { type: 'photo', value: preset.id } : { type: 'icon', value: preset.value ?? preset.id };

    player.profile = { ...player.profile, avatar };
    this.emitToChannel(
      this.channelOf(player.profile.pairingSecret),
      'partner:avatar',
      { sessionId: player.sessionId, avatar },
      player.sessionId
    );
    return { success: true, avatar };
  }
}

export const chatService = new ChatService();
