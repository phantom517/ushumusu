import { describe, test, expect } from 'bun:test';
import { MindMeldGame, normalizeMindWord } from './mindmeld';
import { mindCloseness, mindVectorCloseness, closenessLabel, levenshtein, MINDMELD_CONFIG } from '@tether/shared';

const A = 'sess-anna';
const B = 'sess-noor';

describe('MindMeldGame', () => {
  test('starts in writing phase with an empty first round', () => {
    const game = new MindMeldGame();
    const state = game.createInitialState([A, B]);

    expect(state.phase).toBe('writing');
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0].index).toBe(0);
    expect(state.rounds[0].words).toEqual({});
    expect(state.winnerPlayerId).toBeNull();
  });

  test('sanitize never leaks the opponent word before both seal', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mind_word', word: 'Moon' }).newState!;

    const forA = game.sanitizeState(state, A);
    const forB = game.sanitizeState(state, B);

    expect(forA.phase).toBe('writing');
    expect(forA.myWord).toBe('moon');
    expect(forA.hasSubmitted).toBe(true);
    expect(forA.opponentHasSubmitted).toBe(false);
    expect(forA.reveal).toBeUndefined();
    expect(forB.hasSubmitted).toBe(false);
    expect(forB.opponentHasSubmitted).toBe(true);
    expect(JSON.stringify(forB)).not.toContain('moon'); // B must not see A's word
  });

  test('rejects invalid words and duplicate submissions', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);

    expect(game.handleAction(state, A, { type: 'mind_word', word: 'x' }).success).toBe(false); // too short
    expect(game.handleAction(state, A, { type: 'mind_word', word: 'two words' }).success).toBe(false);
    expect(game.handleAction(state, A, { type: 'mind_word', word: 'hello123' }).success).toBe(false);

    state = game.handleAction(state, A, { type: 'mind_word', word: 'apple' }).newState!;
    expect(game.handleAction(state, A, { type: 'mind_word', word: 'apple' }).success).toBe(false);
    expect(game.handleAction(state, 'sess-stranger', { type: 'mind_word', word: 'apple' }).success).toBe(false);
  });

  test('a missed round reveals BOTH words with a closeness reading', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mind_word', word: 'apple' }).newState!;
    const res = game.handleAction(state, B, { type: 'mind_word', word: 'appl' });

    state = res.newState!;
    expect(state.phase).toBe('reveal');
    expect(state.rounds[0].isMatch).toBeUndefined();

    const forA = game.sanitizeState(state, A);
    expect(forA.reveal).toBeDefined();
    expect(forA.reveal!.myWord).toBe('apple');
    expect(forA.reveal!.opponentWord).toBe('appl');
    expect(forA.reveal!.closeness.score).toBeGreaterThan(50); // 1 edit away
    expect(forA.reveal!.closeness.score).toBeLessThan(100);
    expect(forA.reveal!.closeness.sameFirstLetter).toBe(true);
    expect(forA.reveal!.closeness.sameLength).toBe(false);
    expect(forA.history).toHaveLength(0); // current round is on screen, not history
  });

  test('an exact match ends the game as a shared victory', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mind_word', word: 'Coffee' }).newState!;
    const res = game.handleAction(state, B, { type: 'mind_word', word: ' coffee ' });

    state = res.newState!;
    expect(state.phase).toBe('won');
    expect(state.winnerPlayerId).toBeNull();
    expect(state.finishReason).toContain('coffee');

    const completion = game.checkCompletion(state);
    expect(completion.isFinished).toBe(true);
    expect(completion.winnerId).toBeNull();
    expect(state.stats!.roundsPlayed).toBe(1);
    expect(state.stats!.failedRounds).toBe(0);

    const forA = game.sanitizeState(state, A);
    expect(forA.phase).toBe('won');
    expect(forA.history).toHaveLength(1);
    expect(forA.history[0].myWord).toBe('coffee');
    expect(forA.history[0].opponentWord).toBe('coffee');
  });

  test('mind_next starts a fresh round and moves the miss into history', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);
    state = game.handleAction(state, A, { type: 'mind_word', word: 'sun' }).newState!;
    state = game.handleAction(state, B, { type: 'mind_word', word: 'moon' }).newState!;
    expect(state.phase).toBe('reveal');

    const res = game.handleAction(state, B, { type: 'mind_next' });
    state = res.newState!;

    expect(state.phase).toBe('writing');
    expect(state.rounds).toHaveLength(2);
    expect(state.rounds[1].index).toBe(1);
    expect(state.rounds[1].words).toEqual({});

    const forA = game.sanitizeState(state, A);
    expect(forA.roundIndex).toBe(1);
    expect(forA.myWord).toBeUndefined();
    expect(forA.history).toHaveLength(1);
    expect(forA.history[0].myWord).toBe('sun');
    expect(forA.history[0].opponentWord).toBe('moon');
  });

  test('mind_next is rejected while writing and word rejected during reveal', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);
    expect(game.handleAction(state, A, { type: 'mind_next' }).success).toBe(false);

    state = game.handleAction(state, A, { type: 'mind_word', word: 'sun' }).newState!;
    expect(game.handleAction(state, A, { type: 'mind_word', word: 'sky' }).success).toBe(false); // reveal not active yet
  });

  test('stats track bestCloseness across failed rounds before the match', () => {
    const game = new MindMeldGame();
    let state = game.createInitialState([A, B]);

    // Round 1: far apart
    state = game.handleAction(state, A, { type: 'mind_word', word: 'sun' }).newState!;
    state = game.handleAction(state, B, { type: 'mind_word', word: 'xylophone' }).newState!;
    const farScore = game.sanitizeState(state, A).reveal!.closeness.score;
    state = game.handleAction(state, A, { type: 'mind_next' }).newState!;

    // Round 2: closer, still a miss
    state = game.handleAction(state, A, { type: 'mind_word', word: 'starlight' }).newState!;
    state = game.handleAction(state, B, { type: 'mind_word', word: 'starlite' }).newState!;
    const closeScore = game.sanitizeState(state, A).reveal!.closeness.score;
    state = game.handleAction(state, B, { type: 'mind_next' }).newState!;

    // Round 3: match!
    state = game.handleAction(state, A, { type: 'mind_word', word: 'dumpling' }).newState!;
    state = game.handleAction(state, B, { type: 'mind_word', word: 'dumpling' }).newState!;

    expect(state.phase).toBe('won');
    expect(state.stats!.roundsPlayed).toBe(3);
    expect(state.stats!.failedRounds).toBe(2);
    expect(state.stats!.bestCloseness).toBe(Math.max(farScore, closeScore));
    expect(state.stats!.bestCloseness).toBe(closeScore);
  });

  test('normalizeMindWord trims and lowercases; spaces are rejected upstream', () => {
    expect(normalizeMindWord('  Coffee  ')).toBe('coffee');
    expect(MINDMELD_CONFIG.WORD_PATTERN.test(normalizeMindWord('Sun Rise'))).toBe(false);
    expect(MINDMELD_CONFIG.WORD_PATTERN.test(normalizeMindWord('coffee'))).toBe(true);
    expect(normalizeMindWord('')).toBe('');
  });

  test('mindCloseness math is deterministic and never reaches 100 on a miss', () => {
    expect(levenshtein('apple', 'appl')).toBe(1);
    expect(mindCloseness('apple', 'appl').score).toBe(80);
    expect(mindCloseness('sun', 'xylophone').score).toBeLessThan(20);
    expect(mindCloseness('cat', 'cat').score).toBe(100); // exact — game ends before this is used
    expect(mindCloseness('abc', 'xyz').sameFirstLetter).toBe(false);
    expect(mindCloseness('moon', 'moat').sameFirstLetter).toBe(true);
  });

  test('mindVectorCloseness maps embedding cosine onto the game scale', () => {
    expect(mindVectorCloseness(1)).toBe(99); // twin vectors, 100 stays exclusive
    expect(mindVectorCloseness(0.25)).toBe(7); // unrelated-words floor zone
    expect(mindVectorCloseness(0)).toBe(4);
    expect(mindVectorCloseness(-1)).toBe(4);
    expect(mindVectorCloseness(2)).toBe(99); // clamped
    expect(mindVectorCloseness(0.556)).toBe(51); // synonym zone (car/automobile)
    expect(mindVectorCloseness(0.611)).toBe(62); // related zone (coffee/tea)
    expect(mindVectorCloseness(0.85)).toBe(92); // near-identical zone

    // Monotonic: closer vectors never score lower
    let prev = 0;
    for (let c = 0.25; c <= 1.0001; c += 0.05) {
      const s = mindVectorCloseness(c);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  test('closenessLabel matches the shared label ladder', () => {
    expect(closenessLabel(95)).toBe('Twin thoughts');
    expect(closenessLabel(75)).toBe('Same wavelength');
    expect(closenessLabel(50)).toBe('Kindred minds');
    expect(closenessLabel(25)).toBe('Wandering apart');
    expect(closenessLabel(5)).toBe('Galaxies apart');
  });
});
