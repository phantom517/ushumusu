import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  MOLE_CONFIG,
  AVAILABLE_GAMES,
  MoleServerState,
  MoleClientState,
  MoleAction,
  MoleScore,
} from '@tether/shared';

/** Fresh session key so clients restart their local mole field on every game/rematch. */
function newSessionKey(): string {
  return `mole-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class HitTheMoleGame implements GameDefinition<MoleServerState, MoleClientState, MoleAction> {
  public id = 'pixel-mole';
  public name = 'Hit the Mole';
  public description =
    'Both phones get the same 30 seconds of moles. Score on your own screen, then the high scores go head to head.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'pixel-mole')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): MoleServerState {
    return {
      roomId: '',
      gameId: 'pixel-mole',
      phase: 'playing',
      playerIds,
      round: 1,
      sessionKey: newSessionKey(),
      durationMs: MOLE_CONFIG.DURATION_MS,
      startedAt: Date.now(),
      scores: {},
      winnerPlayerId: null,
      finishReason: undefined,
    };
  }

  public validateAction(state: MoleServerState, playerId: string, action: MoleAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase !== 'playing') {
      return { valid: false, reason: 'The mole duel is already over' };
    }

    switch (action.type) {
      case 'mole_score': {
        if (state.scores[playerId]) {
          return { valid: false, reason: 'Your score is already in the books' };
        }
        const { score, hits } = action;
        if (!Number.isFinite(score) || !Number.isInteger(score) || score < MOLE_CONFIG.MIN_SCORE || score > MOLE_CONFIG.MAX_SCORE) {
          return { valid: false, reason: 'Score is out of range' };
        }
        if (!Number.isFinite(hits) || !Number.isInteger(hits) || hits < 0 || hits > MOLE_CONFIG.MAX_HITS) {
          return { valid: false, reason: 'Hit count is out of range' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: MoleServerState, playerId: string, action: MoleAction): ActionResult<MoleServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const newState: MoleServerState = {
      ...state,
      scores: { ...state.scores },
    };

    switch (action.type) {
      case 'mole_score': {
        newState.scores[playerId] = { score: action.score, hits: action.hits };

        const [p1, p2] = newState.playerIds;
        const s1 = newState.scores[p1];
        const s2 = newState.scores[p2];

        if (s1 && s2) {
          // Head to head: higher score wins; a tie breaks by total hits; a full
          // tie is a draw.
          let winnerPlayerId: string | null = null;
          const exactTie = s1.score === s2.score && s1.hits === s2.hits;
          if (!exactTie) {
            if (s1.score !== s2.score) {
              winnerPlayerId = s1.score > s2.score ? p1 : p2;
            } else {
              winnerPlayerId = s1.hits > s2.hits ? p1 : p2;
            }
          }

          newState.winnerPlayerId = winnerPlayerId;
          newState.phase = 'finished';
          this.calculateStats(newState);

          const margin = Math.abs(s1.score - s2.score);
          newState.finishReason = exactTie
            ? `A dead-heat mash-off: ${s1.score} – ${s2.score}, same hits too.`
            : s1.score === s2.score
            ? `Dead even at ${s1.score} – ${s2.score} — the busier mallet took it.`
            : `Final score ${s1.score} – ${s2.score} — the fastest mallet won by ${margin}.`;
        }
        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: MoleServerState, playerId: string): MoleClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const my = state.scores[playerId];
    const opp = state.scores[opponentId];

    let myResult: 'win' | 'loss' | 'tie' | undefined;
    if (state.phase === 'finished' && my && opp) {
      if (state.winnerPlayerId == null) {
        myResult = 'tie';
      } else {
        myResult = state.winnerPlayerId === playerId ? 'win' : 'loss';
      }
    }

    return {
      roomId: state.roomId,
      gameId: 'pixel-mole',
      phase: state.phase,
      playerIds: state.playerIds,
      round: state.round,
      sessionKey: state.sessionKey,
      durationMs: state.durationMs,
      myScore: my,
      // Fair duel: the opponent's score stays hidden until BOTH are in and the
      // duel resolves — no peeking mid-round.
      opponentScore: state.phase === 'finished' ? opp : undefined,
      hasSubmitted: !!my,
      opponentHasSubmitted: !!opp,
      myResult,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: MoleServerState): GameCompletionResult {
    if (state.phase === 'finished') {
      return {
        isFinished: true,
        winnerId: state.winnerPlayerId,
        reason: state.finishReason,
        finalStats: state.stats as Record<string, any>,
      };
    }
    return { isFinished: false };
  }

  private calculateStats(state: MoleServerState): void {
    const [p1, p2] = state.playerIds;
    const s1 = state.scores[p1];
    const s2 = state.scores[p2];
    state.stats = {
      margin: s1 && s2 ? Math.abs(s1.score - s2.score) : 0,
      totalHits: (s1?.hits ?? 0) + (s2?.hits ?? 0),
      durationSeconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
    };
  }
}

export const hitTheMoleGame = new HitTheMoleGame();
