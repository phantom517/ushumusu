export type HangmanPhase =
  | 'secret_submission' // Phase 0
  | 'letter_queries'    // Phase 1
  | 'free_form_clues'   // Phase 2
  | 'finished';         // Phase 4

export interface InquiryLedgerItem {
  id: string;
  playerId: string;
  type: 'letter' | 'question' | 'guess';
  letter?: string;
  question?: string;
  answer?: string; // 'Yes' | 'No' | 'Partially' | string
  guess?: string;
  foundCount?: number;
  positions?: number[];
  isCorrect?: boolean;
  timestamp: number;
}

export interface PlayerHangmanState {
  playerId: string;
  secretWord?: string; // Stored privately on server only!
  hasSubmittedWord: boolean;
  wordLength: number;
  revealedPositions: Record<number, string>; // Positions opponent has revealed in THIS player's word: index -> letter
  
  // What this player has inquired against the opponent:
  queriedLetters: string[]; // Letters this player has asked about opponent's word
  letterQueriesUsed: number;
  strikes: number; // Missed letters or incorrect guesses
  maxLetterQueries: number;
  maxStrikes: number;
  phase: 'submitting' | 'letters' | 'free_form';
  unlockedFreeForm: boolean;
  hasWon: boolean;
}

export interface PendingQuestion {
  id: string;
  askedByPlayerId: string;
  targetPlayerId: string;
  questionText: string;
  askedAt: number;
}

export interface HangmanServerState {
  roomId: string;
  gameId: 'coding-hangman';
  phase: HangmanPhase;
  playerIds: [string, string];
  players: Record<string, PlayerHangmanState>;
  activeTurnPlayerId: string;
  pendingQuestion?: PendingQuestion | null;
  ledger: InquiryLedgerItem[];
  startedAt: number;
  turnStartedAt: number;
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    totalInquiries: number;
    durationSeconds: number;
    resonancePercent: number;
  };
}

// Client-sanitized state (HIDES opponent's secretWord!)
export interface HangmanClientState {
  roomId: string;
  gameId: 'coding-hangman';
  phase: HangmanPhase;
  playerIds: [string, string];
  activeTurnPlayerId: string;
  isMyTurn: boolean;
  myState: {
    secretWord?: string; // My own secret word
    hasSubmittedWord: boolean;
    wordLength: number;
    revealedPositionsByOpponent: Record<number, string>;
    queriedLetters: string[];
    letterQueriesUsed: number;
    strikes: number;
    maxLetterQueries: number;
    maxStrikes: number;
    phase: 'submitting' | 'letters' | 'free_form';
    unlockedFreeForm: boolean;
  };
  opponentState: {
    hasSubmittedWord: boolean;
    wordLength: number;
    revealedLettersGrid: (string | null)[]; // e.g. [null, 'E', null, null, 'O', 'R']
    revealedCount: number;
    queriedLetters: string[];
    letterQueriesUsed: number;
    strikes: number;
    maxLetterQueries: number;
    maxStrikes: number;
    unlockedFreeForm: boolean;
    secretWord?: string; // ONLY populated if phase === 'finished'
  };
  pendingQuestion?: PendingQuestion | null;
  ledger: InquiryLedgerItem[];
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    totalInquiries: number;
    durationSeconds: number;
    resonancePercent: number;
  };
}

export type HangmanAction =
  | { type: 'submit_word'; word: string }
  | { type: 'letter_query'; letter: string }
  | { type: 'submit_question'; question: string }
  | { type: 'submit_answer'; questionId: string; answer: string }
  | { type: 'submit_guess'; guess: string };
