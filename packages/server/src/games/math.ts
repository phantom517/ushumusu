import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  MATH_CONFIG,
  AVAILABLE_GAMES,
  MathServerState,
  MathClientState,
  MathAction,
  MathQuestion,
  MathQuestionResult,
  MathQuestionHistoryItem,
} from '@tether/shared';

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Builds one equation. Difficulty ramps with position:
 * easy ± → small × → 3-digit ± → exact ÷ / bigger ×.
 * Subtraction never goes negative; division is always exact (integer answers only).
 */
export function generateMathQuestion(index: number): MathQuestion {
  let text: string;
  let answer: number;

  if (index < 2) {
    // Tier 0 — two-digit + / −
    if (Math.random() < 0.5) {
      const a = randInt(10, 99);
      const b = randInt(10, 99);
      text = `${a} + ${b}`;
      answer = a + b;
    } else {
      const a = randInt(20, 99);
      const b = randInt(2, a - 2);
      text = `${a} − ${b}`;
      answer = a - b;
    }
  } else if (index < 4) {
    // Tier 1 — small multiplication
    const a = randInt(3, 12);
    const b = randInt(3, 12);
    text = `${a} × ${b}`;
    answer = a * b;
  } else if (index < 6) {
    // Tier 2 — three-digit + / −
    if (Math.random() < 0.5) {
      const a = randInt(120, 899);
      const b = randInt(11, 99);
      text = `${a} + ${b}`;
      answer = a + b;
    } else {
      const a = randInt(200, 999);
      const b = randInt(10, a - 10);
      text = `${a} − ${b}`;
      answer = a - b;
    }
  } else {
    // Tier 3 — exact division or bigger multiplication
    if (Math.random() < 0.5) {
      const divisor = randInt(3, 9);
      const quotient = randInt(4, 15);
      text = `${divisor * quotient} / ${divisor}`;
      answer = quotient;
    } else {
      const a = randInt(12, 19);
      const b = randInt(6, 12);
      text = `${a} × ${b}`;
      answer = a * b;
    }
  }

  return { index, text, answer };
}

export class MathDuelGame implements GameDefinition<MathServerState, MathClientState, MathAction> {
  public id = 'delta-drill';
  public name = 'Math Duel';
  public description =
    'Both phones receive the same eight equations. Solve at your own speed — every correct answer is a point, and the higher score wins.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'delta-drill')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): MathServerState {
    const questions: MathQuestion[] = [];
    for (let i = 0; i < MATH_CONFIG.TOTAL_QUESTIONS; i++) {
      questions.push(generateMathQuestion(i));
    }
    return {
      roomId: '',
      gameId: 'delta-drill',
      phase: 'solving',
      playerIds,
      questions,
      results: {},
      finishedAt: {},
      startedAt: Date.now(),
      winnerPlayerId: null,
      finishReason: undefined,
    };
  }

  public validateAction(state: MathServerState, playerId: string, action: MathAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase !== 'solving') {
      return { valid: false, reason: 'The math duel is already over' };
    }

    switch (action.type) {
      case 'math_answer': {
        const nextIndex = this.nextUnanswered(state, playerId);
        if (action.index !== nextIndex) {
          return { valid: false, reason: 'Answer the current question first' };
        }
        if (
          action.answer !== null &&
          (!Number.isFinite(action.answer) || !Number.isInteger(action.answer) || action.answer < 0 || action.answer > 99999)
        )
          return { valid: false, reason: 'That does not look like a valid answer' };
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: MathServerState, playerId: string, action: MathAction): ActionResult<MathServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const newState: MathServerState = {
      ...state,
      results: { ...state.results, [playerId]: { ...state.results[playerId] } },
      finishedAt: { ...state.finishedAt },
    };

    switch (action.type) {
      case 'math_answer': {
        const question = newState.questions[action.index];
        const result: MathQuestionResult =
          action.answer === null
            ? { myAnswer: null, isCorrect: false }
            : { myAnswer: action.answer, isCorrect: action.answer === question.answer };
        newState.results[playerId]![action.index] = result;

        // Player finished their whole set?
        if (this.nextUnanswered(newState, playerId) >= MATH_CONFIG.TOTAL_QUESTIONS) {
          newState.finishedAt[playerId] = Date.now();

          const [p1, p2] = newState.playerIds;
          if (newState.finishedAt[p1] && newState.finishedAt[p2]) {
            this.finish(newState);
          }
        }
        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: MathServerState, playerId: string): MathClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const mine = state.results[playerId] || {};
    const theirs = state.results[opponentId] || {};
    const isFinished = state.phase === 'finished';

    const history: MathQuestionHistoryItem[] = [];
    let myCorrectCount = 0;

    for (const question of state.questions) {
      const my = mine[question.index];
      const opp = theirs[question.index];
      if (!my) continue; // I have not reached this question yet — not in my history

      if (my.isCorrect) myCorrectCount++;

      history.push({
        index: question.index,
        text: question.text,
        myAnswer: my.myAnswer,
        myCorrect: my.isCorrect,
        // Revealed only for questions I already answered.
        correctAnswer: question.answer,
        // Opponent's result leaks in per question once BOTH have answered it
        // (and always by the time the duel is finished).
        opponentAnswer: (opp || isFinished) && opp ? opp.myAnswer : undefined,
        opponentCorrect: (opp || isFinished) && opp ? opp.isCorrect : undefined,
      });
    }

    const myIndex = this.nextUnanswered(state, playerId);
    const oppIndex = this.nextUnanswered(state, opponentId);
    const opponentDone = oppIndex >= MATH_CONFIG.TOTAL_QUESTIONS;

    let myResult: 'win' | 'loss' | 'tie' | undefined;
    if (isFinished && state.stats) {
      myResult =
        state.winnerPlayerId == null
          ? 'tie'
          : state.winnerPlayerId === playerId
          ? 'win'
          : 'loss';
    }

    return {
      roomId: state.roomId,
      gameId: 'delta-drill',
      phase: state.phase,
      playerIds: state.playerIds,
      totalQuestions: MATH_CONFIG.TOTAL_QUESTIONS,
      questionTimeMs: MATH_CONFIG.QUESTION_TIME_MS,
      current:
        state.phase === 'solving' && myIndex < MATH_CONFIG.TOTAL_QUESTIONS
          ? { index: myIndex, text: state.questions[myIndex].text }
          : undefined,
      history,
      myCorrectCount,
      opponentIndex: Math.min(oppIndex, MATH_CONFIG.TOTAL_QUESTIONS),
      opponentDone,
      myResult,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: MathServerState): GameCompletionResult {
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

  /** First index this player has not answered yet (TOTAL once done). */
  private nextUnanswered(state: MathServerState, playerId: string): number {
    const mine = state.results[playerId] || {};
    for (let i = 0; i < MATH_CONFIG.TOTAL_QUESTIONS; i++) {
      if (!mine[i]) return i;
    }
    return MATH_CONFIG.TOTAL_QUESTIONS;
  }

  private finish(state: MathServerState): void {
    const [p1, p2] = state.playerIds;
    const score = (pid: string): number =>
      Object.values(state.results[pid] || {}).filter((r) => r?.isCorrect).length;

    const s1 = score(p1);
    const s2 = score(p2);
    const t1 = state.finishedAt[p1]!;
    const t2 = state.finishedAt[p2]!;

    let winnerPlayerId: string | null = null;
    if (s1 !== s2) {
      winnerPlayerId = s1 > s2 ? p1 : p2;
    } else if (t1 !== t2) {
      // Same score — the faster solver takes it.
      winnerPlayerId = t1 < t2 ? p1 : p2;
    }

    state.winnerPlayerId = winnerPlayerId;
    state.phase = 'finished';
    state.stats = {
      scores: { [p1]: s1, [p2]: s2 },
      totalCorrect: s1 + s2,
      durationSeconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
    };
    state.finishReason =
      winnerPlayerId === null
        ? `Dead even at ${s1} – ${s2} — two calculators in love.`
        : s1 === s2
        ? `Both scored ${s1} — the quicker solver took the crown.`
        : `Final score ${Math.max(s1, s2)} – ${Math.min(s1, s2)} — won by ${Math.abs(s1 - s2)}.`;
  }
}

export const mathDuelGame = new MathDuelGame();
