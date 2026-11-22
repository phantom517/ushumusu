import { describe, test, expect } from 'bun:test';
import { MathDuelGame, generateMathQuestion } from './math';
import { MATH_CONFIG } from '@tether/shared';

const A = 'sess-anna';
const B = 'sess-noor';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Answers every remaining question for a player using the question's true answer (or override). */
function playOut(
  game: MathDuelGame,
  state: ReturnType<MathDuelGame['createInitialState']>,
  playerId: string,
  wrongFirst = false
) {
  let s = state;
  for (let i = 0; i < MATH_CONFIG.TOTAL_QUESTIONS; i++) {
    const answer = wrongFirst && i === 0 ? state.questions[i].answer + 1 : state.questions[i].answer;
    s = game.handleAction(s, playerId, { type: 'math_answer', index: i, answer }).newState!;
  }
  return s;
}

describe('MathDuelGame', () => {
  test('generates the shared sequence with server-only answers', () => {
    const game = new MathDuelGame();
    const state = game.createInitialState([A, B]);

    expect(state.phase).toBe('solving');
    expect(state.questions).toHaveLength(MATH_CONFIG.TOTAL_QUESTIONS);
    expect(state.results).toEqual({});
    state.questions.forEach((q, i) => {
      expect(q.index).toBe(i);
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.text.length).toBeGreaterThan(0);
    });
    expect(game.checkCompletion(state).isFinished).toBe(false);
  });

  test('sanitize shows the current equation but NEVER leaks any answer', () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);

    const forA = game.sanitizeState(state, A);
    expect(forA.current!.index).toBe(0);
    expect(forA.current!.text).toBe(state.questions[0].text);
    expect(forA.myCorrectCount).toBe(0);
    expect(forA.history).toHaveLength(0);
    expect(forA.opponentIndex).toBe(0);

    // The raw answer must not appear anywhere in the client state — not even
    // for questions further down the sequence.
    for (const q of state.questions) {
      expect(JSON.stringify(forA)).not.toContain(`"answer":${q.answer}`);
    }
  });

  test('answers are graded and the correct answer is revealed only after answering', () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);

    const right = state.questions[0].answer;
    state = game.handleAction(state, A, { type: 'math_answer', index: 0, answer: right }).newState!;

    let forA = game.sanitizeState(state, A);
    expect(forA.current!.index).toBe(1);
    expect(forA.myCorrectCount).toBe(1);
    expect(forA.history).toHaveLength(1);
    expect(forA.history[0].myCorrect).toBe(true);
    expect(forA.history[0].correctAnswer).toBe(right);
    expect(forA.history[0].opponentAnswer).toBeUndefined(); // B has not answered yet

    // Wrong answer on the next one
    const wrong = state.questions[1].answer + 1;
    state = game.handleAction(state, A, { type: 'math_answer', index: 1, answer: wrong }).newState!;
    forA = game.sanitizeState(state, A);
    expect(forA.history[1].myCorrect).toBe(false);
    expect(forA.history[1].myAnswer).toBe(wrong);
    expect(forA.myCorrectCount).toBe(1);
  });

  test('answers must come in order: skipping ahead is rejected', () => {
    const game = new MathDuelGame();
    const state = game.createInitialState([A, B]);

    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 2, answer: 5 }).success
    ).toBe(false);
    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 1, answer: 5 }).success
    ).toBe(false);
    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 0, answer: state.questions[0].answer }).success
    ).toBe(true);
  });

  test('null answer records a skip; duplicates and bogus answers are rejected', () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);

    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 0, answer: 1.5 }).success
    ).toBe(false);
    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 0, answer: -3 }).success
    ).toBe(false);

    state = game.handleAction(state, A, { type: 'math_answer', index: 0, answer: null }).newState!;
    const forA = game.sanitizeState(state, A);
    expect(forA.history[0].myAnswer).toBeNull();
    expect(forA.history[0].myCorrect).toBe(false);

    expect(
      game.handleAction(state, A, { type: 'math_answer', index: 0, answer: 5 }).success
    ).toBe(false); // already answered
    expect(
      game.handleAction(state, 'sess-stranger', { type: 'math_answer', index: 0, answer: 5 }).success
    ).toBe(false);
  });

  test('one player finishing alone keeps the duel in solving phase', async () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);
    state = playOut(game, state, A);

    expect(state.phase).toBe('solving');
    expect(state.finishedAt[A]).toBeTruthy();

    const forB = game.sanitizeState(state, B);
    expect(forB.opponentDone).toBe(true);
    expect(forB.opponentIndex).toBe(MATH_CONFIG.TOTAL_QUESTIONS);

    const forA = game.sanitizeState(state, A);
    expect(forA.current).toBeUndefined(); // A has nothing left to answer
    expect(forA.myCorrectCount).toBe(MATH_CONFIG.TOTAL_QUESTIONS);
    expect(game.checkCompletion(state).isFinished).toBe(false);
  });

  test('both finishing → higher score wins with a per-question recap', async () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);
    state = playOut(game, state, A); // A: all correct
    await sleep(5);
    state = playOut(game, state, B, true); // B: first answer wrong

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(A);
    expect(state.stats!.scores[A]).toBe(MATH_CONFIG.TOTAL_QUESTIONS);
    expect(state.stats!.scores[B]).toBe(MATH_CONFIG.TOTAL_QUESTIONS - 1);
    expect(state.finishReason).toContain('Final score');

    const forA = game.sanitizeState(state, A);
    expect(forA.myResult).toBe('win');
    expect(forA.history).toHaveLength(MATH_CONFIG.TOTAL_QUESTIONS);
    // Recap includes the opponent now that both are done
    expect(forA.history[0].opponentCorrect).toBe(false);
    expect(forA.history[1].opponentCorrect).toBe(true);

    const forB = game.sanitizeState(state, B);
    expect(forB.myResult).toBe('loss');
    expect(forB.history[0].opponentCorrect).toBe(true);
  });

  test('equal scores are broken by who finished faster', async () => {
    const game = new MathDuelGame();
    let state = game.createInitialState([A, B]);
    state = playOut(game, state, A);
    await sleep(5); // ensure A's finishedAt is strictly earlier
    state = playOut(game, state, B);

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(A); // same score, earlier finish
    expect(state.finishReason).toContain('quicker solver');

    const forA = game.sanitizeState(state, A);
    expect(forA.myResult).toBe('win');
    const forB = game.sanitizeState(state, B);
    expect(forB.myResult).toBe('loss');
  });

  test('question generation guards: subtraction stays positive, division is exact', () => {
    for (let i = 0; i < 200; i++) {
      const q = generateMathQuestion(Math.floor(Math.random() * MATH_CONFIG.TOTAL_QUESTIONS));
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(q.answer)).toBe(true);

      const divMatch = q.text.match(/^(\d+) \/ (\d+)$/);
      if (divMatch) {
        const [a, b] = [Number(divMatch[1]), Number(divMatch[2])];
        expect(a % b).toBe(0);
        expect(a / b).toBe(q.answer);
      }
      const subMatch = q.text.match(/^(\d+) − (\d+)$/);
      if (subMatch) {
        expect(Number(subMatch[1]) - Number(subMatch[2])).toBe(q.answer);
        expect(q.answer).toBeGreaterThan(0);
      }
      const addMatch = q.text.match(/^(\d+) \+ (\d+)$/);
      if (addMatch) {
        expect(Number(addMatch[1]) + Number(addMatch[2])).toBe(q.answer);
      }
      const mulMatch = q.text.match(/^(\d+) × (\d+)$/);
      if (mulMatch) {
        expect(Number(mulMatch[1]) * Number(mulMatch[2])).toBe(q.answer);
      }
    }
  });
});
