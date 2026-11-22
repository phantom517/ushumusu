import { describe, test, expect } from 'bun:test';
import { HitTheMoleGame } from './mole';

const A = 'sess-anna';
const B = 'sess-noor';

describe('HitTheMoleGame', () => {
  test('starts in playing phase with no scores and a fresh session key', () => {
    const game = new HitTheMoleGame();
    const state = game.createInitialState([A, B]);

    expect(state.phase).toBe('playing');
    expect(state.scores).toEqual({});
    expect(state.durationMs).toBeGreaterThan(0);
    expect(state.sessionKey).toBeTruthy();
    expect(state.winnerPlayerId).toBeNull();
    expect(game.checkCompletion(state).isFinished).toBe(false);
  });

  test('a submitted score is visible to its owner but hidden from the opponent', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mole_score', score: 24, hits: 26 }).newState!;

    expect(state.phase).toBe('playing');

    const forA = game.sanitizeState(state, A);
    expect(forA.hasSubmitted).toBe(true);
    expect(forA.myScore).toEqual({ score: 24, hits: 26 });
    expect(forA.opponentHasSubmitted).toBe(false);
    expect(forA.opponentScore).toBeUndefined();

    const forB = game.sanitizeState(state, B);
    expect(forB.hasSubmitted).toBe(false);
    expect(forB.opponentHasSubmitted).toBe(true);
    expect(forB.myScore).toBeUndefined();
    expect(forB.opponentScore).toBeUndefined();
    expect(JSON.stringify(forB)).not.toContain('"score":24'); // hidden until the duel resolves
  });

  test('both scores in → higher score wins the duel', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mole_score', score: 24, hits: 26 }).newState!;
    const res = game.handleAction(state, B, { type: 'mole_score', score: 19, hits: 21 });

    state = res.newState!;
    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(A);
    expect(state.finishReason).toContain('24 – 19');
    expect(state.stats!.margin).toBe(5);

    const completion = game.checkCompletion(state);
    expect(completion.isFinished).toBe(true);
    expect(completion.winnerId).toBe(A);

    const forWinner = game.sanitizeState(state, A);
    const forLoser = game.sanitizeState(state, B);
    expect(forWinner.myResult).toBe('win');
    expect(forLoser.myResult).toBe('loss');
  });

  test('score tie is broken by total hits', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mole_score', score: 20, hits: 25 }).newState!;
    state = game.handleAction(state, B, { type: 'mole_score', score: 20, hits: 30 }).newState!;

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(B); // more hits
    expect(state.finishReason).toContain('mallet took it');
  });

  test('a full tie (score and hits) is a shared draw', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mole_score', score: 20, hits: 25 }).newState!;
    state = game.handleAction(state, B, { type: 'mole_score', score: 20, hits: 25 }).newState!;

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBeNull();

    const forA = game.sanitizeState(state, A);
    const forB = game.sanitizeState(state, B);
    expect(forA.myResult).toBe('tie');
    expect(forB.myResult).toBe('tie');
  });

  test('rejects invalid submissions', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);

    // out of range / non-integer / bogus hits
    expect(game.handleAction(state, A, { type: 'mole_score', score: 10000, hits: 5 }).success).toBe(false);
    expect(game.handleAction(state, A, { type: 'mole_score', score: 12.5, hits: 5 }).success).toBe(false);
    expect(game.handleAction(state, A, { type: 'mole_score', score: 10, hits: -1 }).success).toBe(false);
    expect(game.handleAction(state, 'sess-stranger', { type: 'mole_score', score: 10, hits: 2 }).success).toBe(false);

    // duplicate submission
    state = game.handleAction(state, A, { type: 'mole_score', score: 10, hits: 12 }).newState!;
    expect(game.handleAction(state, A, { type: 'mole_score', score: 99, hits: 40 }).success).toBe(false);

    // submitting after the duel ended
    state = game.handleAction(state, B, { type: 'mole_score', score: 30, hits: 31 }).newState!;
    expect(game.handleAction(state, A, { type: 'mole_score', score: 5, hits: 5 }).success).toBe(false);
  });

  test('negative scores (bombs) are accepted within bounds', () => {
    const game = new HitTheMoleGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mole_score', score: -4, hits: 3 }).newState!;
    expect(state.scores[A]).toEqual({ score: -4, hits: 3 });

    state = game.handleAction(state, B, { type: 'mole_score', score: 2, hits: 4 }).newState!;
    expect(state.winnerPlayerId).toBe(B);
  });
});
