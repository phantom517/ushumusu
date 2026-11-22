export type WyrPhase = 'answering' | 'reveal' | 'finished';

export type WyrChoice = 'a' | 'b';

export interface WyrQuestion {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
}

/** Server-side round. Choices stay hidden until both players have answered. */
export interface WyrRoundServerState {
  index: number; // 0-based
  questionId: string;
  question: string;
  optionA: string;
  optionB: string;
  choices: Partial<Record<string, WyrChoice>>; // sessionId -> choice
  isSynced?: boolean; // set once both have answered
}

export interface WyrServerState {
  roomId: string;
  gameId: 'syntax-duel';
  phase: WyrPhase;
  playerIds: [string, string];
  rounds: WyrRoundServerState[]; // last entry is the active round
  totalRounds: number;
  startedAt: number;
  winnerPlayerId?: string | null; // always null (draw) — WYR is cooperative
  finishReason?: string;
  stats?: {
    completedRounds: number;
    syncedRounds: number;
    agreementPercent: number;
    durationSeconds: number;
  };
}

export interface WyrRoundHistoryItem {
  index: number;
  question: string;
  optionA: string;
  optionB: string;
  myChoice: WyrChoice;
  opponentChoice: WyrChoice;
  isSynced: boolean;
}

/** Client-sanitized state. NEVER leaks the opponent's pick before both answered. */
export interface WyrClientState {
  roomId: string;
  gameId: 'syntax-duel';
  phase: WyrPhase;
  playerIds: [string, string];
  totalRounds: number;
  currentRound?: {
    index: number;
    questionId: string;
    question: string;
    optionA: string;
    optionB: string;
    myChoice?: WyrChoice;
    hasAnswered: boolean;
    opponentHasAnswered: boolean;
    opponentChoice?: WyrChoice; // ONLY present once both have answered (reveal)
    isSynced?: boolean;
  };
  history: WyrRoundHistoryItem[];
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    completedRounds: number;
    syncedRounds: number;
    agreementPercent: number;
    durationSeconds: number;
  };
}

export type WyrAction =
  | { type: 'answer'; choice: WyrChoice }
  | { type: 'next_round' };
