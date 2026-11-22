import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ConnectAck,
  RoomState,
  WyrChoice,
  ChatMessage,
  AvatarInfo,
} from '@tether/shared';
import { useProfileStore } from '../stores/useProfileStore';
import { useSocketStore } from '../stores/useSocketStore';
import { useChatStore } from '../stores/useChatStore';
import { router } from 'expo-router';

// Avoids re-navigating to the same screen on every game state update
let lastRoutedPath = '';

function routeOnce(path: string): void {
  if (lastRoutedPath === path) return;
  lastRoutedPath = path;
  router.replace(path);
}

function resetRouteTracking(): void {
  lastRoutedPath = '';
}

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private currentServerUrl: string = '';

  public getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.socket;
  }

  public initConnection(serverUrl: string): void {
    if (this.socket && this.currentServerUrl === serverUrl && this.socket.connected) {
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.currentServerUrl = serverUrl;
    useSocketStore.getState().setConnectionStatus(false, true, null);

    console.log(`[SocketService] Connecting to server at ${serverUrl}...`);

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      extraHeaders: {
        'bypass-tunnel-reminder': 'true',
      },
      reconnection: true,
      reconnectionAttempts: 25,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });

    this.setupListeners();
    this.startPingLoop();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log(`[SocketService] Connected to server, socketId: ${this.socket?.id}`);
      useSocketStore.getState().setConnectionStatus(true, false, null);

      // Authenticate with profile & stored session token
      this.authenticateSession();
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[SocketService] Disconnected from server: ${reason}`);
      useSocketStore.getState().setConnectionStatus(false, false, `Disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      console.warn(`[SocketService] Connection error: ${error.message}`);
      useSocketStore
        .getState()
        .setConnectionStatus(false, false, `Cannot reach server: ${error.message}`);
    });

    // 1. MATCHMAKING
    this.socket.on('matchmaking:status', (payload) => {
      useSocketStore.getState().setMatchmakingStatus(payload.status, payload.message);
    });

    this.socket.on('matchmaking:matched', (payload) => {
      console.log('[SocketService] Matched with companion:', payload.opponent.displayName);
      useSocketStore.getState().setMatchmakingStatus('matched', `Matched with ${payload.opponent.displayName}!`);
      useSocketStore.getState().setMatchedData(payload);
      router.replace('/lobby');
    });

    // 2. ROOM & LOBBY
    this.socket.on('room:state', (room: RoomState) => {
      useSocketStore.getState().setCurrentRoom(room);

      if (room.gameStatus === 'playing' && room.gameState) {
        const gameState = room.gameState as any;
        if (gameState.gameId === 'delta-drill') {
          useSocketStore.getState().setMathState(gameState);
          routeOnce('/game/math');
          return;
        }
        if (gameState.gameId === 'pixel-mole') {
          useSocketStore.getState().setMoleState(gameState);
          routeOnce('/game/mole');
          return;
        }
        if (gameState.gameId === 'parallel-minds') {
          useSocketStore.getState().setMindmeldState(gameState);
          routeOnce('/game/mindmeld');
          return;
        }
        if (gameState.gameId === 'quantum-bazaar') {
          useSocketStore.getState().setAuctionState(gameState);
          routeOnce('/game/auction');
          return;
        }
        if (gameState.gameId === 'syntax-duel') {
          useSocketStore.getState().setWyrState(gameState);
          routeOnce('/game/wyr');
          return;
        }
        useSocketStore.getState().setHangmanState(gameState);
        if (gameState.phase === 'secret_submission') {
          routeOnce('/game/setup');
        } else {
          routeOnce('/game/hangman');
        }
      } else if (room.gameStatus === 'finished' && room.gameState) {
        const gameState = room.gameState as any;
        if (gameState.gameId === 'delta-drill') {
          useSocketStore.getState().setMathState(gameState);
          routeOnce('/game/math');
          return;
        }
        if (gameState.gameId === 'pixel-mole') {
          useSocketStore.getState().setMoleState(gameState);
          routeOnce('/game/mole');
          return;
        }
        if (gameState.gameId === 'parallel-minds') {
          useSocketStore.getState().setMindmeldState(gameState);
          routeOnce('/game/mindmeld');
          return;
        }
        if (gameState.gameId === 'quantum-bazaar') {
          useSocketStore.getState().setAuctionState(gameState);
          routeOnce('/game/auction');
          return;
        }
        if (gameState.gameId === 'syntax-duel') {
          useSocketStore.getState().setWyrState(gameState);
          routeOnce('/game/wyr');
          return;
        }
        useSocketStore.getState().setHangmanState(gameState);
        routeOnce('/game/results');
      }
    });

    this.socket.on('room:closed', (data) => {
      resetRouteTracking();
      useSocketStore.getState().clearAllGameState();
      alert(`Sanctuary Notice: ${data.reason}`);
      router.replace('/home');
    });

    // 3. GAME STATE
    this.socket.on('game:state', (data) => {
      const gameState = data.gameState as any;
      if (gameState?.gameId === 'delta-drill') {
        useSocketStore.getState().setMathState(gameState);
        routeOnce('/game/math');
        return;
      }
      if (gameState?.gameId === 'pixel-mole') {
        useSocketStore.getState().setMoleState(gameState);
        routeOnce('/game/mole');
        return;
      }
      if (gameState?.gameId === 'parallel-minds') {
        useSocketStore.getState().setMindmeldState(gameState);
        if (gameState.phase === 'writing' || gameState.phase === 'reveal') {
          routeOnce('/game/mindmeld');
        }
        return;
      }
      if (gameState?.gameId === 'quantum-bazaar') {
        useSocketStore.getState().setAuctionState(gameState);
        if (gameState.phase === 'bidding' || gameState.phase === 'reveal') {
          routeOnce('/game/auction');
        }
        return;
      }
      if (gameState?.gameId === 'syntax-duel') {
        useSocketStore.getState().setWyrState(gameState);
        if (gameState.phase === 'answering' || gameState.phase === 'reveal') {
          routeOnce('/game/wyr');
        }
        return;
      }
      if (gameState?.gameId === 'coding-hangman') {
        useSocketStore.getState().setHangmanState(gameState);
        if (gameState.phase === 'secret_submission') {
          routeOnce('/game/setup');
        } else if (gameState.phase === 'finished') {
          routeOnce('/game/results');
        } else {
          routeOnce('/game/hangman');
        }
      }
    });

    this.socket.on('game:finish', (data) => {
      const gameState = data.gameState as any;
      if (gameState?.gameId === 'delta-drill') {
        useSocketStore.getState().setMathState(gameState);
        routeOnce('/game/math');
        return;
      }
      if (gameState?.gameId === 'pixel-mole') {
        useSocketStore.getState().setMoleState(gameState);
        routeOnce('/game/mole');
        return;
      }
      if (gameState?.gameId === 'parallel-minds') {
        useSocketStore.getState().setMindmeldState(gameState);
        routeOnce('/game/mindmeld');
        return;
      }
      if (gameState?.gameId === 'quantum-bazaar') {
        useSocketStore.getState().setAuctionState(gameState);
        routeOnce('/game/auction');
        return;
      }
      if (gameState?.gameId === 'syntax-duel') {
        useSocketStore.getState().setWyrState(gameState);
        routeOnce('/game/wyr');
        return;
      }
      useSocketStore.getState().setHangmanState(gameState);
      routeOnce('/game/results');
    });

    // Mind Meld — async AI vibe reading for a revealed round
    this.socket.on('game:mindmeld:vibe', (data) => {
      useSocketStore.getState().setMindmeldVibe(data);
    });

    // Couple chat — ephemeral messages scoped by the pairing secret
    this.socket.on('chat:message', ({ message }) => {
      useChatStore.getState().addMessage(message);
    });
    this.socket.on('chat:typing', ({ sessionId, typing }) => {
      const own = useChatStore.getState().ownSessionId;
      if (sessionId !== own) useChatStore.getState().setPartnerTyping(typing);
    });
    this.socket.on('chat:presence', (data) => {
      useChatStore.getState().setPresence(data);
    });
    this.socket.on('partner:avatar', ({ sessionId, avatar }) => {
      const own = useChatStore.getState().ownSessionId;
      if (sessionId !== own) useChatStore.getState().setPartnerAvatar(avatar);
    });
    this.socket.on('chat:invite:update', (data) => {
      useChatStore.getState().updateInviteStatus(data.inviteId, data.status);
    });
    // My invite got accepted — jump into matchmaking for that game.
    // (The accepter navigates locally when they tap Accept.)
    this.socket.on('chat:invite:accepted', (data) => {
      const own = useChatStore.getState().ownSessionId;
      if (data.bySessionId !== own) {
        router.push({ pathname: '/matchmaking', params: { gameId: data.gameId } });
      }
    });

    // 4. RECONNECTION & OPPONENT PRESENCE
    this.socket.on('player:opponent_disconnected', (data) => {
      useSocketStore
        .getState()
        .setOpponentDisconnected(data.graceSecondsLeft, data.opponentName);
    });

    this.socket.on('player:opponent_reconnected', (data) => {
      useSocketStore.getState().setOpponentDisconnected(null, null);
    });

    this.socket.on('player:session_expired', (data) => {
      useProfileStore.getState().setSessionToken(null);
      useSocketStore.getState().clearAllGameState();
      alert(`Session notice: ${data.message}`);
      router.replace('/home');
    });
  }

  public authenticateSession(): void {
    const profile = useProfileStore.getState().profile;
    const sessionToken = useProfileStore.getState().sessionToken;
    const pairingSecret = useProfileStore.getState().pairingSecret;

    if (!profile || !this.socket) return;

    this.socket.emit(
      'player:connect',
      {
        profile,
        sessionToken: sessionToken || undefined,
        pairingSecret,
      },
      (ack: ConnectAck) => {
        if (ack.success) {
          useProfileStore.getState().setSessionToken(ack.sessionId);
          if (ack.isReconnected && ack.activeRoom) {
            console.log('[SocketService] Restored active room session:', ack.activeRoom.roomId);
            useSocketStore.getState().setCurrentRoom(ack.activeRoom);
            const gameState = ack.activeRoom.gameState as any;
            if (gameState?.gameId === 'delta-drill') {
              useSocketStore.getState().setMathState(gameState);
            } else if (gameState?.gameId === 'pixel-mole') {
              useSocketStore.getState().setMoleState(gameState);
            } else if (gameState?.gameId === 'parallel-minds') {
              useSocketStore.getState().setMindmeldState(gameState);
            } else if (gameState?.gameId === 'quantum-bazaar') {
              useSocketStore.getState().setAuctionState(gameState);
            } else if (gameState?.gameId === 'syntax-duel') {
              useSocketStore.getState().setWyrState(gameState);
            } else if (gameState) {
              useSocketStore.getState().setHangmanState(gameState);
            }
          }
        } else {
          console.warn('[SocketService] Connect auth rejected:', ack.error);
        }
      }
    );
  }

  private startPingLoop(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);

    this.pingInterval = setInterval(() => {
      if (!this.socket || !this.socket.connected) return;
      const start = Date.now();
      this.socket.emit('player:ping', start, () => {
        const latency = Date.now() - start;
        useSocketStore.getState().setLatency(latency);
      });
    }, 10000);
  }

  public joinMatchmaking(gameId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected to server' });
      }
      const pairingSecret = useProfileStore.getState().pairingSecret;
      this.socket.emit('matchmaking:join', { gameId, pairingSecret }, (res) => {
        resolve(res);
      });
    });
  }

  public cancelMatchmaking(): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false });
      }
      this.socket.emit('matchmaking:cancel', (res) => {
        useSocketStore.getState().setMatchmakingStatus('idle');
        resolve(res);
      });
    });
  }

  public toggleReady(isReady: boolean): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('room:ready', { isReady }, (res) => {
        resolve(res);
      });
    });
  }

  public startRoom(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('room:start', (res) => {
        resolve(res);
      });
    });
  }

  public leaveRoom(): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false });
      }
      this.socket.emit('room:leave', (res) => {
        resetRouteTracking();
        useSocketStore.getState().clearAllGameState();
        resolve(res);
      });
    });
  }

  public submitWyrAnswer(choice: WyrChoice): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:wyr:answer', { choice }, (res) => {
        resolve(res);
      });
    });
  }

  public nextWyrRound(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:wyr:next', (res) => {
        resolve(res);
      });
    });
  }

  public submitAuctionBid(itemId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:auction:bid', { itemId, amount }, (res) => {
        resolve(res);
      });
    });
  }

  public foldAuctionItem(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:auction:fold', (res) => {
        resolve(res);
      });
    });
  }

  public nextAuctionItem(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:auction:next', (res) => {
        resolve(res);
      });
    });
  }

  public submitMindmeldWord(word: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:mindmeld:word', { word }, (res) => {
        resolve(res);
      });
    });
  }

  public nextMindmeldRound(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:mindmeld:next', (res) => {
        resolve(res);
      });
    });
  }

  public submitMoleScore(score: number, hits: number): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:mole:submit', { score, hits }, (res) => {
        resolve(res);
      });
    });
  }

  public submitMathAnswer(index: number, answer: number | null): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:math:answer', { index, answer }, (res) => {
        resolve(res);
      });
    });
  }

  public submitSecretWord(word: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:word:submit', { word }, (res) => {
        resolve(res);
      });
    });
  }

  public queryLetter(letter: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:letter:query', { letter }, (res) => {
        resolve(res);
      });
    });
  }

  public submitQuestion(question: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:question:submit', { question }, (res) => {
        resolve(res);
      });
    });
  }

  public submitAnswer(questionId: string, answer: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:answer:submit', { questionId, answer }, (res) => {
        resolve(res);
      });
    });
  }

  public submitGuess(guess: string): Promise<{ success: boolean; isCorrect?: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('game:guess:submit', { guess }, (res) => {
        resolve(res);
      });
    });
  }

  public voteRematch(vote: boolean): Promise<{ success: boolean; rematchTriggered?: boolean }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false });
      }
      this.socket.emit('game:rematch', { vote }, (res) => {
        resolve(res);
      });
    });
  }

  // ── Couple chat (ephemeral, 15-minute TTL) ──────────────────────────

  public openChat(): Promise<{
    success: boolean;
    messages: ChatMessage[];
    partnerOnline: boolean;
    partnerName: string | null;
    partnerAvatar: AvatarInfo | null;
    error?: string;
  }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({
          success: false,
          messages: [],
          partnerOnline: false,
          partnerName: null,
          partnerAvatar: null,
          error: 'Not connected',
        });
      }
      this.socket.emit('chat:open', (res) => resolve(res));
    });
  }

  public closeChat(): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('chat:close', () => undefined);
  }

  public sendChatMessage(text: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('chat:send', { text }, (res) => resolve(res));
    });
  }

  public setChatTyping(typing: boolean): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('chat:typing', { typing });
  }

  public setChatAvatar(avatarId: string): Promise<{ success: boolean; avatar?: AvatarInfo; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('chat:avatar', { avatarId }, (res) => resolve(res));
    });
  }

  public sendChatInvite(gameId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('chat:invite', { gameId }, (res) => resolve(res));
    });
  }

  public respondChatInvite(inviteId: string, accept: boolean): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Not connected' });
      }
      this.socket.emit('chat:invite:respond', { inviteId, accept }, (res) => resolve(res));
    });
  }

  public disconnect(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
