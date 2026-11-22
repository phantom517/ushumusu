export type MolePhase = 'playing' | 'finished';

/** One player's whack-a-mole session result. */
export interface MoleScore {
  score: number;
  hits: number;
}

export interface MoleServerState {
  roomId: string;
  gameId: 'pixel-mole';
  phase: MolePhase;
  playerIds: [string, string];
  round: number; // rematch counter (informational)
  sessionKey: string; // new key per game/rematch — clients restart their session on change
  durationMs: number; // how long each player's mole session lasts
  startedAt: number;
  scores: Partial<Record<string, MoleScore>>; // filled in as each player submits
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    margin: number; // winning gap in points (0 on a tie)
    totalHits: number;
    durationSeconds: number;
  };
}

/**
 * Client-sanitized state. Each player plays their own local session; the
 * opponent's score only appears once they have submitted it.
 */
export interface MoleClientState {
  roomId: string;
  gameId: 'pixel-mole';
  phase: MolePhase;
  playerIds: [string, string];
  round: number;
  sessionKey: string;
  durationMs: number;
  myScore?: MoleScore; // present once I submitted
  opponentScore?: MoleScore; // present once THEY submitted
  hasSubmitted: boolean;
  opponentHasSubmitted: boolean;
  /** From THIS viewer's perspective: win / loss / tie. Only when finished. */
  myResult?: 'win' | 'loss' | 'tie';
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    margin: number;
    totalHits: number;
    durationSeconds: number;
  };
}

export type MoleAction = { type: 'mole_score'; score: number; hits: number };
