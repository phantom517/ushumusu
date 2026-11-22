export type MathPhase = 'solving' | 'finished';

/** One shared equation. `answer` lives on the server ONLY — never sanitized out. */
export interface MathQuestion {
  index: number; // 0-based position in the shared sequence
  text: string; // e.g. "58 + 26", "7 × 8", "36 / 4"
  answer: number; // always a non-negative integer
}

/** A player's outcome for one question. myAnswer null = ran out of time / skipped. */
export interface MathQuestionResult {
  myAnswer: number | null;
  isCorrect: boolean;
}

export interface MathServerState {
  roomId: string;
  gameId: 'delta-drill';
  phase: MathPhase;
  playerIds: [string, string];
  questions: MathQuestion[]; // SAME sequence for both players
  results: Record<string, Partial<Record<number, MathQuestionResult>>>; // per player per question
  finishedAt: Partial<Record<string, number>>; // when each player answered their last question
  startedAt: number;
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    scores: Record<string, number>; // correct count per player
    totalCorrect: number;
    durationSeconds: number;
  };
}

export interface MathQuestionHistoryItem {
  index: number;
  text: string;
  myAnswer: number | null;
  myCorrect: boolean;
  correctAnswer: number; // revealed once I have answered it
  opponentAnswer?: number | null; // ONLY once BOTH have answered it
  opponentCorrect?: boolean;
}

/**
 * Client-sanitized state. NEVER leaks an unanswered question's answer, and the
 * opponent's score/results stay hidden until both players are done.
 */
export interface MathClientState {
  roomId: string;
  gameId: 'delta-drill';
  phase: MathPhase;
  playerIds: [string, string];
  totalQuestions: number;
  questionTimeMs: number;
  /** The question I must answer right now (undefined once I finished all). */
  current?: {
    index: number;
    text: string;
  };
  /** Per-question history from MY point of view; opponent results leak in per-question once both answered. */
  history: MathQuestionHistoryItem[];
  myCorrectCount: number;
  opponentIndex: number; // which question the opponent is on (progress only, no score)
  opponentDone: boolean;
  myResult?: 'win' | 'loss' | 'tie';
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    scores: Record<string, number>;
    totalCorrect: number;
    durationSeconds: number;
  };
}

export type MathAction = { type: 'math_answer'; index: number; answer: number | null };
