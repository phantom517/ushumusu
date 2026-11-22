import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  MINDMELD_CONFIG,
  AVAILABLE_GAMES,
  mindCloseness,
  MindMeldServerState,
  MindMeldClientState,
  MindMeldAction,
  MindMeldRoundServerState,
  MindMeldRoundHistoryItem,
} from '@tether/shared';

/** Normalizes a word for comparison: trim + lowercase (single word, no spaces). */
export function normalizeMindWord(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export class MindMeldGame implements GameDefinition<
  MindMeldServerState,
  MindMeldClientState,
  MindMeldAction
> {
  public id = 'parallel-minds';
  public name = 'Mind Meld';
  public description =
    'Both companions silently write one word. Match it and you win together — miss, and each round reveals both words plus how close your minds were.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'parallel-minds')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): MindMeldServerState {
    return {
      roomId: '',
      gameId: 'parallel-minds',
      phase: 'writing',
      playerIds,
      rounds: [this.createRound(0)],
      startedAt: Date.now(),
      winnerPlayerId: null, // cooperative game — a match is a shared victory
      finishReason: undefined,
    };
  }

  public validateAction(state: MindMeldServerState, playerId: string, action: MindMeldAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase === 'won') {
      return { valid: false, reason: 'Your minds already matched — game is over' };
    }

    const currentRound = state.rounds[state.rounds.length - 1];
    if (!currentRound) {
      return { valid: false, reason: 'No active round' };
    }

    switch (action.type) {
      case 'mind_word': {
        if (state.phase !== 'writing') {
          return { valid: false, reason: 'This round is sealed — words are being revealed' };
        }
        if (currentRound.words[playerId]) {
          return { valid: false, reason: 'Your word is already sealed for this round' };
        }
        const word = normalizeMindWord(action.word);
        if (!MINDMELD_CONFIG.WORD_PATTERN.test(word)) {
          return {
            valid: false,
            reason: `Pick a single word with ${MINDMELD_CONFIG.MIN_WORD_LENGTH}–${MINDMELD_CONFIG.MAX_WORD_LENGTH} letters`,
          };
        }
        return { valid: true };
      }

      case 'mind_next': {
        if (state.phase !== 'reveal') {
          return { valid: false, reason: 'Wait for both words to be revealed first' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: MindMeldServerState, playerId: string, action: MindMeldAction): ActionResult<MindMeldServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const newState: MindMeldServerState = {
      ...state,
      rounds: state.rounds.map((r) => ({ ...r, words: { ...r.words } })),
    };
    const currentRound = newState.rounds[newState.rounds.length - 1];

    switch (action.type) {
      case 'mind_word': {
        const word = normalizeMindWord(action.word);
        currentRound.words[playerId] = word;

        const [p1, p2] = newState.playerIds;
        const wordA = currentRound.words[p1];
        const wordB = currentRound.words[p2];

        if (wordA && wordB) {
          // Both sealed — compare privately on the server.
          if (wordA === wordB) {
            currentRound.isMatch = true;
            currentRound.closeness = { score: 100, sameFirstLetter: true, sameLength: true, label: 'Matched' };
            newState.phase = 'won';
            newState.winnerPlayerId = null;
            this.calculateStats(newState);
            const roundsWord = newState.stats!.roundsPlayed === 1 ? 'round' : 'rounds';
            newState.finishReason = `“${wordA}” — your minds merged after ${newState.stats!.roundsPlayed} ${roundsWord}.`;
          } else {
            currentRound.closeness = mindCloseness(wordA, wordB);
            newState.phase = 'reveal';
          }
        }
        return { success: true, newState };
      }

      case 'mind_next': {
        newState.rounds.push(this.createRound(newState.rounds.length));
        newState.phase = 'writing';
        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: MindMeldServerState, playerId: string): MindMeldClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const currentRound = state.rounds[state.rounds.length - 1];
    const isReveal = state.phase === 'reveal';
    const isWon = state.phase === 'won';

    // Rounds with both words in, EXCLUDING the one currently on screen
    // (during reveal/won the last round is the current one and shown above).
    const historyRounds = isReveal || isWon ? state.rounds.slice(0, -1) : state.rounds;
    const history: MindMeldRoundHistoryItem[] = historyRounds
      .filter((r) => r.words[playerId] && r.words[opponentId])
      .map((r) => ({
        index: r.index,
        myWord: r.words[playerId]!,
        opponentWord: r.words[opponentId]!,
        closeness: r.closeness!,
      }));

    // In 'won' phase the matching round IS the history's missing piece — append it
    // so the recap shows the winning word too.
    if (isWon && currentRound?.isMatch && currentRound.words[playerId] && currentRound.words[opponentId]) {
      history.push({
        index: currentRound.index,
        myWord: currentRound.words[playerId]!,
        opponentWord: currentRound.words[opponentId]!,
        closeness: currentRound.closeness!,
      });
    }

    return {
      roomId: state.roomId,
      gameId: 'parallel-minds',
      phase: state.phase,
      playerIds: state.playerIds,
      roundIndex: currentRound?.index ?? 0,
      // My own sealed word is always visible to me; the opponent's never is
      // until both are in (and a miss means reveal, a match means won).
      myWord: currentRound?.words[playerId],
      hasSubmitted: !!currentRound?.words[playerId],
      opponentHasSubmitted: !!currentRound?.words[opponentId],
      reveal:
        isReveal && currentRound?.closeness && currentRound.words[playerId] && currentRound.words[opponentId]
          ? {
              myWord: currentRound.words[playerId]!,
              opponentWord: currentRound.words[opponentId]!,
              closeness: currentRound.closeness,
            }
          : undefined,
      history,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: MindMeldServerState): GameCompletionResult {
    if (state.phase === 'won') {
      return {
        isFinished: true,
        winnerId: state.winnerPlayerId, // null → shared victory
        reason: state.finishReason,
        finalStats: state.stats as Record<string, any>,
      };
    }
    return { isFinished: false };
  }

  private createRound(index: number): MindMeldRoundServerState {
    return { index, words: {} };
  }

  private calculateStats(state: MindMeldServerState): void {
    const completed = state.rounds.filter((r) => r.words[state.playerIds[0]] && r.words[state.playerIds[1]]);
    const failed = completed.filter((r) => !r.isMatch);
    state.stats = {
      roundsPlayed: completed.length,
      failedRounds: failed.length,
      bestCloseness: failed.reduce((best, r) => Math.max(best, r.closeness?.score ?? 0), 0),
      durationSeconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
    };
  }
}

export const mindMeldGame = new MindMeldGame();
