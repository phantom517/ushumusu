export type MindMeldPhase = 'writing' | 'reveal' | 'won';

/** How close two minds are, measured after a failed round. */
export interface MindCloseness {
  score: number; // 0–99 (100 is reserved for an exact match → instant win)
  sameFirstLetter: boolean;
  sameLength: boolean;
  label: string; // playful one-liner, e.g. "Same wavelength"
}

/** Server-side round. Words stay hidden until BOTH players have sealed one. */
export interface MindMeldRoundServerState {
  index: number; // 0-based
  words: Partial<Record<string, string>>; // sessionId -> normalized word (PRIVATE)
  closeness?: MindCloseness; // set once both words are in (never a match here)
  isMatch?: boolean; // set once both words are in
}

export interface MindMeldServerState {
  roomId: string;
  gameId: 'parallel-minds';
  phase: MindMeldPhase;
  playerIds: [string, string];
  rounds: MindMeldRoundServerState[]; // last entry is the active round
  startedAt: number;
  winnerPlayerId?: string | null; // always null — matching is a shared victory
  finishReason?: string;
  stats?: {
    roundsPlayed: number; // rounds completed (including the winning round)
    failedRounds: number; // rounds where the words missed
    bestCloseness: number; // best closeness score across FAILED rounds
    durationSeconds: number;
  };
}

export interface MindMeldRoundHistoryItem {
  index: number;
  myWord: string;
  opponentWord: string;
  closeness: MindCloseness;
}

/** Client-sanitized state. NEVER leaks the opponent's word before both sealed. */
export interface MindMeldClientState {
  roomId: string;
  gameId: 'parallel-minds';
  phase: MindMeldPhase;
  playerIds: [string, string];
  roundIndex: number; // active round (0-based)
  myWord?: string; // my OWN sealed word this round (visible to me only)
  hasSubmitted: boolean;
  opponentHasSubmitted: boolean;
  reveal?: {
    // ONLY present in reveal phase (both words are in and MISSED)
    myWord: string;
    opponentWord: string;
    closeness: MindCloseness;
  };
  history: MindMeldRoundHistoryItem[]; // completed rounds (both words in)
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    roundsPlayed: number;
    failedRounds: number;
    bestCloseness: number;
    durationSeconds: number;
  };
}

export type MindMeldAction =
  | { type: 'mind_word'; word: string }
  | { type: 'mind_next' };
