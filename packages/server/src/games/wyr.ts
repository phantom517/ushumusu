import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  WYR_CONFIG,
  AVAILABLE_GAMES,
  WyrServerState,
  WyrClientState,
  WyrAction,
  WyrRoundServerState,
  WyrRoundHistoryItem,
} from '@tether/shared';
import { questionService } from '../services/questionService';

export class WouldYouRatherGame implements GameDefinition<WyrServerState, WyrClientState, WyrAction> {
  public id = 'syntax-duel';
  public name = 'Would You Rather';
  public description =
    'A shared either-or duel. Both companions receive the same question, pick privately, then reveal together to see how in-sync you are.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'syntax-duel')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): WyrServerState {
    const firstRound = this.createRound(playerIds, [], 0);
    return {
      roomId: '',
      gameId: 'syntax-duel',
      phase: 'answering',
      playerIds,
      rounds: [firstRound],
      totalRounds: WYR_CONFIG.TOTAL_ROUNDS,
      startedAt: Date.now(),
      winnerPlayerId: null, // cooperative game — always a shared result
      finishReason: undefined,
    };
  }

  public validateAction(state: WyrServerState, playerId: string, action: WyrAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase === 'finished') {
      return { valid: false, reason: 'Game has already finished' };
    }

    const currentRound = state.rounds[state.rounds.length - 1];
    if (!currentRound) {
      return { valid: false, reason: 'No active round' };
    }

    switch (action.type) {
      case 'answer': {
        if (state.phase !== 'answering') {
          return { valid: false, reason: 'This round is no longer accepting answers' };
        }
        if (currentRound.choices[playerId]) {
          return { valid: false, reason: 'You have already answered this question' };
        }
        if (action.choice !== 'a' && action.choice !== 'b') {
          return { valid: false, reason: 'Choice must be "a" or "b"' };
        }
        return { valid: true };
      }

      case 'next_round': {
        if (state.phase !== 'reveal') {
          return { valid: false, reason: 'Both companions must answer before moving on' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: WyrServerState, playerId: string, action: WyrAction): ActionResult<WyrServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const now = Date.now();
    const newState: WyrServerState = {
      ...state,
      rounds: state.rounds.map((r) => ({ ...r, choices: { ...r.choices } })),
    };
    const currentRound = newState.rounds[newState.rounds.length - 1];

    switch (action.type) {
      case 'answer': {
        currentRound.choices[playerId] = action.choice;

        const [p1, p2] = newState.playerIds;
        const bothAnswered = !!currentRound.choices[p1] && !!currentRound.choices[p2];
        if (bothAnswered) {
          currentRound.isSynced = currentRound.choices[p1] === currentRound.choices[p2];
          newState.phase = 'reveal';
        }
        return { success: true, newState };
      }

      case 'next_round': {
        const playedRounds = newState.rounds.length;
        if (playedRounds >= newState.totalRounds) {
          newState.phase = 'finished';
          this.calculateStats(newState);
          newState.finishReason = `You matched ${newState.stats?.syncedRounds} of ${newState.stats?.completedRounds} picks together.`;
          return { success: true, newState };
        }

        const usedQuestionIds = newState.rounds.map((r) => r.questionId);
        newState.rounds.push(this.createRound(newState.playerIds, usedQuestionIds, playedRounds));
        newState.phase = 'answering';
        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: WyrServerState, playerId: string): WyrClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const isFinished = state.phase === 'finished';
    const isReveal = state.phase === 'reveal';

    const currentRound = state.rounds[state.rounds.length - 1];
    const currentClientRound = currentRound && !isFinished
      ? {
          index: currentRound.index,
          questionId: currentRound.questionId,
          question: currentRound.question,
          optionA: currentRound.optionA,
          optionB: currentRound.optionB,
          myChoice: currentRound.choices[playerId],
          hasAnswered: !!currentRound.choices[playerId],
          opponentHasAnswered: !!currentRound.choices[opponentId],
          // STRICT PRIVACY: opponent's pick is only revealed once both answered!
          opponentChoice: isReveal ? currentRound.choices[opponentId] : undefined,
          isSynced: isReveal ? currentRound.isSynced : undefined,
        }
      : undefined;

    // Rounds both players completed, excluding the one currently on screen
    // (during reveal the last round IS the current one; when finished everything is history).
    const historyRounds = isFinished ? state.rounds : state.rounds.slice(0, -1);
    const history: WyrRoundHistoryItem[] = historyRounds
      .filter((r) => r.choices[playerId] && r.choices[opponentId])
      .map((r) => ({
        index: r.index,
        question: r.question,
        optionA: r.optionA,
        optionB: r.optionB,
        myChoice: r.choices[playerId]!,
        opponentChoice: r.choices[opponentId]!,
        isSynced: !!r.isSynced,
      }));

    return {
      roomId: state.roomId,
      gameId: 'syntax-duel',
      phase: state.phase,
      playerIds: state.playerIds,
      totalRounds: state.totalRounds,
      currentRound: currentClientRound,
      history,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: WyrServerState): GameCompletionResult {
    if (state.phase === 'finished') {
      return {
        isFinished: true,
        winnerId: state.winnerPlayerId, // null → shared draw
        reason: state.finishReason,
        finalStats: state.stats,
      };
    }
    return { isFinished: false };
  }

  private createRound(
    playerIds: [string, string],
    usedQuestionIds: string[],
    index: number
  ): WyrRoundServerState {
    const question = questionService.takeQuestion(usedQuestionIds);
    return {
      index,
      questionId: question.id,
      question: question.question,
      optionA: question.optionA,
      optionB: question.optionB,
      choices: {},
    };
  }

  private calculateStats(state: WyrServerState): void {
    const completedRounds = state.rounds.length;
    const syncedRounds = state.rounds.filter((r) => r.isSynced).length;
    const agreementPercent = Math.round((syncedRounds / Math.max(1, completedRounds)) * 100);
    const durationSeconds = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));

    state.stats = {
      completedRounds,
      syncedRounds,
      agreementPercent,
      durationSeconds,
    };
  }
}

export const wouldYouRatherGame = new WouldYouRatherGame();
