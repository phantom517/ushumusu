import { create } from 'zustand';
import {
  RoomState,
  HangmanClientState,
  WyrClientState,
  AuctionClientState,
  MindMeldClientState,
  MoleClientState,
  MathClientState,
  MatchmakingStatus,
  MatchFoundPayload,
  PlayerProfile,
} from '@tether/shared';

interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  latencyMs: number;

  // Matchmaking
  matchmakingStatus: MatchmakingStatus;
  matchmakingMessage: string;
  matchedData: MatchFoundPayload | null;

  // Active Room
  currentRoom: RoomState | null;

  // Active Game State
  currentGameId: string | null;
  hangmanState: HangmanClientState | null;
  wyrState: WyrClientState | null;
  auctionState: AuctionClientState | null;
  mindmeldState: MindMeldClientState | null;
  /** Async AI vibe line for a revealed Mind Meld round (may arrive late). */
  mindmeldVibe: { roundIndex: number; vibe: string; closeness?: number | null } | null;
  moleState: MoleClientState | null;
  mathState: MathClientState | null;

  // Opponent Disconnect / Grace Period
  opponentGraceSeconds: number | null;
  opponentDisconnectedName: string | null;

  // Actions
  setConnectionStatus: (isConnected: boolean, isConnecting: boolean, error?: string | null) => void;
  setLatency: (latency: number) => void;
  setMatchmakingStatus: (status: MatchmakingStatus, message?: string) => void;
  setMatchedData: (data: MatchFoundPayload | null) => void;
  setCurrentRoom: (room: RoomState | null) => void;
  setHangmanState: (state: HangmanClientState | null) => void;
  setWyrState: (state: WyrClientState | null) => void;
  setAuctionState: (state: AuctionClientState | null) => void;
  setMindmeldState: (state: MindMeldClientState | null) => void;
  setMindmeldVibe: (vibe: { roundIndex: number; vibe: string } | null) => void;
  setMoleState: (state: MoleClientState | null) => void;
  setMathState: (state: MathClientState | null) => void;
  setOpponentDisconnected: (graceSeconds: number | null, name: string | null) => void;
  clearAllGameState: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  latencyMs: 18,

  matchmakingStatus: 'idle',
  matchmakingMessage: '',
  matchedData: null,

  currentRoom: null,
  currentGameId: null,
  hangmanState: null,
  wyrState: null,
  auctionState: null,
  mindmeldState: null,
  mindmeldVibe: null,
  moleState: null,
  mathState: null,

  opponentGraceSeconds: null,
  opponentDisconnectedName: null,

  setConnectionStatus: (isConnected, isConnecting, connectionError = null) =>
    set({ isConnected, isConnecting, connectionError }),

  setLatency: (latencyMs) => set({ latencyMs }),

  setMatchmakingStatus: (status, message = '') =>
    set({ matchmakingStatus: status, matchmakingMessage: message }),

  setMatchedData: (matchedData) => set({ matchedData }),

  setCurrentRoom: (currentRoom) => set({ currentRoom }),

  setHangmanState: (hangmanState) =>
    set({ hangmanState, currentGameId: hangmanState ? 'coding-hangman' : null }),

  setWyrState: (wyrState) =>
    set({ wyrState, currentGameId: wyrState ? 'syntax-duel' : null }),

  setAuctionState: (auctionState) =>
    set({ auctionState, currentGameId: auctionState ? 'quantum-bazaar' : null }),

  setMindmeldState: (mindmeldState) =>
    set({ mindmeldState, currentGameId: mindmeldState ? 'parallel-minds' : null }),

  setMindmeldVibe: (mindmeldVibe) => set({ mindmeldVibe }),

  setMoleState: (moleState) => set({ moleState, currentGameId: moleState ? 'pixel-mole' : null }),

  setMathState: (mathState) => set({ mathState, currentGameId: mathState ? 'delta-drill' : null }),

  setOpponentDisconnected: (graceSeconds, name) =>
    set({ opponentGraceSeconds: graceSeconds, opponentDisconnectedName: name }),

  clearAllGameState: () =>
    set({
      currentRoom: null,
      hangmanState: null,
      wyrState: null,
      auctionState: null,
      mindmeldState: null,
      mindmeldVibe: null,
      moleState: null,
      mathState: null,
      currentGameId: null,
      matchmakingStatus: 'idle',
      matchedData: null,
      opponentGraceSeconds: null,
      opponentDisconnectedName: null,
    }),
}));
