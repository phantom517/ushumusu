import { describe, expect, it } from 'bun:test';
import { WouldYouRatherGame } from './wyr';
import { parseWyrQuestion, WyrServerState } from '@tether/shared';

describe('Would You Rather Server Logic', () => {
  const game = new WouldYouRatherGame();
  const player1 = 'p1-session';
  const player2 = 'p2-session';

  it('parses API question format into two options', () => {
    const parsed = parseWyrQuestion(
      'Would you rather be unhappily single OR unhappily married?',
      'q1'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.optionA).toBe('be unhappily single');
    expect(parsed!.optionB).toBe('unhappily married');
    expect(parsed!.id).toBe('q1');

    // No uppercase OR separator -> unparseable -> null (fallback used)
    expect(parseWyrQuestion('Would you rather be single or married?', 'q2')).toBeNull();
    expect(parseWyrQuestion('', 'q3')).toBeNull();
  });

  it('initializes with a first round in answering phase', () => {
    const state = game.createInitialState([player1, player2]);
    expect(state.phase).toBe('answering');
    expect(state.gameId).toBe('syntax-duel');
    expect(state.rounds.length).toBe(1);
    expect(state.rounds[0].optionA).toBeTruthy();
    expect(state.rounds[0].optionB).toBeTruthy();
    expect(Object.keys(state.rounds[0].choices).length).toBe(0);
  });

  it('never leaks the opponent choice before both answered', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'answer', choice: 'a' }).newState!;

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.currentRound!.myChoice).toBe('a');
    expect(p1View.currentRound!.hasAnswered).toBe(true);
    expect(p1View.currentRound!.opponentChoice).toBeUndefined(); // STRICT PRIVACY
    expect(p1View.currentRound!.opponentHasAnswered).toBe(false);

    const p2View = game.sanitizeState(state, player2);
    expect(p2View.currentRound!.myChoice).toBeUndefined();
    expect(p2View.currentRound!.hasAnswered).toBe(false);
    expect(p2View.currentRound!.opponentChoice).toBeUndefined(); // STILL HIDDEN
    expect(p2View.currentRound!.opponentHasAnswered).toBe(true);
  });

  it('reveals both picks once both have answered', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'answer', choice: 'a' }).newState!;
    state = game.handleAction(state, player2, { type: 'answer', choice: 'a' }).newState!;

    expect(state.phase).toBe('reveal');
    expect(state.rounds[0].isSynced).toBe(true);

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.currentRound!.opponentChoice).toBe('a'); // now public
    expect(p1View.currentRound!.isSynced).toBe(true);
  });

  it('blocks double answers and premature next_round', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'answer', choice: 'a' }).newState!;

    expect(game.handleAction(state, player1, { type: 'answer', choice: 'b' }).success).toBe(false);
    expect(game.handleAction(state, player1, { type: 'next_round' }).success).toBe(false);

    // both must answer before advancing
    state = game.handleAction(state, player2, { type: 'answer', choice: 'b' }).newState!;
    expect(state.rounds[0].isSynced).toBe(false);
  });

  it('advances through rounds and finishes with draw + stats', () => {
    let state = game.createInitialState([player1, player2]);
    const total = state.totalRounds;

    for (let i = 0; i < total; i++) {
      const syncPick = i % 2 === 0 ? 'a' : 'b';
      const oppPick = i % 2 === 0 ? 'a' : 'a'; // synced on evens, different on odds
      state = game.handleAction(state, player1, { type: 'answer', choice: syncPick as any }).newState!;
      state = game.handleAction(state, player2, { type: 'answer', choice: oppPick as any }).newState!;
      expect(state.phase).toBe('reveal');

      if (i < total - 1) {
        state = game.handleAction(state, player1, { type: 'next_round' }).newState!;
        expect(state.phase).toBe('answering');
        expect(state.rounds.length).toBe(i + 2);
        // New round must not reuse a previous question id
        const usedIds = state.rounds.slice(0, -1).map((r) => r.questionId);
        expect(usedIds).not.toContain(state.rounds[state.rounds.length - 1].questionId);
      } else {
        state = game.handleAction(state, player2, { type: 'next_round' }).newState!;
      }
    }

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBeNull(); // cooperative draw
    expect(state.stats!.completedRounds).toBe(total);
    // Synced on even indices (0, 2, 4, …) — ceil for odd round counts
    const expectedSynced = Math.ceil(total / 2);
    expect(state.stats!.syncedRounds).toBe(expectedSynced);
    expect(state.stats!.agreementPercent).toBe(Math.round((expectedSynced / total) * 100));

    const completion = game.checkCompletion(state);
    expect(completion.isFinished).toBe(true);
    expect(completion.winnerId).toBeNull();

    // Final history exposes both picks to both players
    const p1View = game.sanitizeState(state, player1);
    expect(p1View.history.length).toBe(total);
    expect(p1View.currentRound).toBeUndefined();
  });

  it('rejects actions from players outside the room', () => {
    const state = game.createInitialState([player1, player2]);
    expect(game.handleAction(state, 'intruder', { type: 'answer', choice: 'a' }).success).toBe(false);
    expect(game.handleAction({ ...state, phase: 'reveal' } as WyrServerState, 'intruder', { type: 'next_round' }).success).toBe(false);
  });
});
