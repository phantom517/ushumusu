import { PlayerProfile, AvatarInfo } from './profile';
import {
  ChatMessage,
  ChatSendAck,
  ChatOpenAck,
  ChatCloseAck,
  ChatAvatarAck,
  ChatInviteUpdateEvent,
  ChatInviteAcceptedEvent,
} from './chat';
import { MatchmakingJoinPayload, MatchmakingStatusPayload, MatchFoundPayload } from './matchmaking';
import { RoomState } from './room';
import { HangmanClientState } from './hangman';
import { WyrClientState, WyrChoice } from './wyr';
import { AuctionClientState } from './auction';
import { MindMeldClientState } from './mindmeld';
import { MoleClientState } from './mole';
import { MathClientState } from './math';

export type GameClientState = HangmanClientState | WyrClientState | AuctionClientState | MindMeldClientState | MoleClientState | MathClientState;

export interface ConnectPayload {
  profile: PlayerProfile;
  sessionToken?: string;
  pairingSecret?: string;
}

export interface ConnectAck {
  success: boolean;
  sessionId: string;
  isReconnected: boolean;
  activeRoom?: RoomState;
  error?: string;
}

export interface ReconnectPayload {
  sessionToken: string;
}

export interface ReconnectAck {
  success: boolean;
  sessionId?: string;
  activeRoom?: RoomState;
  error?: string;
}

export interface ServerToClientEvents {
  // Connection
  'player:reconnected': (data: { sessionId: string; activeRoom?: RoomState }) => void;
  'player:opponent_disconnected': (data: { graceSecondsLeft: number; opponentName: string }) => void;
  'player:opponent_reconnected': (data: { opponentName: string }) => void;
  'player:session_expired': (data: { message: string }) => void;
  'server:error': (data: { code: string; message: string }) => void;
  'server:ping': (timestamp: number) => void;

  // Matchmaking
  'matchmaking:status': (payload: MatchmakingStatusPayload) => void;
  'matchmaking:matched': (payload: MatchFoundPayload) => void;

  // Room / Lobby
  'room:state': (room: RoomState) => void;
  'room:closed': (data: { reason: string }) => void;

  // Game
  'game:start': (data: { gameId: string; gameState: any }) => void;
  'game:state': (data: { gameId: string; gameState: GameClientState }) => void;
  'game:finish': (data: { winnerPlayerId?: string | null; finishReason: string; gameState: GameClientState }) => void;

  // Mind Meld — AI vibe reading for a revealed round (async, may arrive late)
  'game:mindmeld:vibe': (data: { roundIndex: number; vibe: string; closeness?: number | null }) => void;

  // Couple chat — ephemeral, messages expire after CHAT_CONFIG.TTL_MS
  'chat:message': (data: { message: ChatMessage }) => void;
  'chat:typing': (data: { sessionId: string; typing: boolean }) => void;
  'chat:presence': (data: { partnerOnline: boolean; partnerName: string | null }) => void;
  'partner:avatar': (data: { sessionId: string; avatar: AvatarInfo }) => void;
  'chat:invite:update': (data: ChatInviteUpdateEvent) => void;
  'chat:invite:accepted': (data: ChatInviteAcceptedEvent) => void;
}

export interface ClientToServerEvents {
  // Connection
  'player:connect': (payload: ConnectPayload, ack: (res: ConnectAck) => void) => void;
  'player:reconnect': (payload: ReconnectPayload, ack: (res: ReconnectAck) => void) => void;
  'player:ping': (timestamp: number, ack: (serverTime: number) => void) => void;

  // Matchmaking
  'matchmaking:join': (payload: MatchmakingJoinPayload, ack: (res: { success: boolean; error?: string }) => void) => void;
  'matchmaking:cancel': (ack: (res: { success: boolean }) => void) => void;

  // Lobby
  'room:ready': (data: { isReady: boolean }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'room:start': (ack: (res: { success: boolean; error?: string }) => void) => void;
  'room:leave': (ack: (res: { success: boolean }) => void) => void;

  // Game actions
  'game:word:submit': (data: { word: string }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:letter:query': (data: { letter: string }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:question:submit': (data: { question: string }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:answer:submit': (data: { questionId: string; answer: string }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:guess:submit': (data: { guess: string }, ack: (res: { success: boolean; isCorrect?: boolean; error?: string }) => void) => void;
  'game:wyr:answer': (data: { choice: WyrChoice }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:wyr:next': (ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:auction:bid': (data: { itemId: string; amount: number }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:auction:fold': (ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:auction:next': (ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:mindmeld:word': (data: { word: string }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:mindmeld:next': (ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:mole:submit': (data: { score: number; hits: number }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:math:answer': (data: { index: number; answer: number | null }, ack: (res: { success: boolean; error?: string }) => void) => void;
  'game:rematch': (data: { vote: boolean }, ack: (res: { success: boolean; rematchTriggered?: boolean; error?: string }) => void) => void;

  // Couple chat — scoped by the pair's shared pairingSecret
  'chat:open': (ack: (res: ChatOpenAck) => void) => void;
  'chat:close': (ack: (res: ChatCloseAck) => void) => void;
  'chat:send': (data: { text: string }, ack: (res: ChatSendAck) => void) => void;
  'chat:typing': (data: { typing: boolean }) => void;
  'chat:avatar': (data: { avatarId: string }, ack: (res: ChatAvatarAck) => void) => void;
  'chat:invite': (data: { gameId: string }, ack: (res: ChatSendAck) => void) => void;
  'chat:invite:respond': (data: { inviteId: string; accept: boolean }, ack: (res: ChatSendAck) => void) => void;
}
