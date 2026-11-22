import { describe, expect, it } from 'bun:test';
import { CodingHangmanGame } from './hangman';
import { validateSecretWord } from '@tether/shared';

describe('Coding Hangman Server Logic', () => {
  const game = new CodingHangmanGame();
  const player1 = 'p1-session';
  const player2 = 'p2-session';

  it('validates secret word constraints', () => {
    expect(validateSecretWord('cat').valid).toBe(false); // < 4 chars
    expect(validateSecretWord('TOOLONGFORWORDLIMITEXCEEDING').valid).toBe(false); // > 12 chars
    expect(validateSecretWord('CODE123').valid).toBe(false); // numbers
    expect(validateSecretWord('PYTHON').valid).toBe(true);
    expect(validateSecretWord('  docker  ').normalized).toBe('DOCKER');
  });

  it('initializes game in secret_submission phase', () => {
    const state = game.createInitialState([player1, player2]);
    expect(state.phase).toBe('secret_submission');
    expect(state.players[player1].hasSubmittedWord).toBe(false);
    expect(state.players[player2].hasSubmittedWord).toBe(false);
  });

  it('progresses to letter_queries once both submit words', () => {
    let state = game.createInitialState([player1, player2]);

    const res1 = game.handleAction(state, player1, { type: 'submit_word', word: 'PYTHON' });
    expect(res1.success).toBe(true);
    state = res1.newState!;
    expect(state.phase).toBe('secret_submission');

    const res2 = game.handleAction(state, player2, { type: 'submit_word', word: 'REACT' });
    expect(res2.success).toBe(true);
    state = res2.newState!;
    expect(state.phase).toBe('letter_queries');
    expect(state.activeTurnPlayerId).toBe(player1);
  });

  it('strictly sanitizes state to hide opponent secret word during play', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'submit_word', word: 'PYTHON' }).newState!;
    state = game.handleAction(state, player2, { type: 'submit_word', word: 'REACT' }).newState!;

    const p1Sanitized = game.sanitizeState(state, player1);
    expect(p1Sanitized.myState.secretWord).toBe('PYTHON');
    expect(p1Sanitized.opponentState.secretWord).toBeUndefined(); // NEVER transmitted!
    expect(p1Sanitized.opponentState.wordLength).toBe(5);

    const p2Sanitized = game.sanitizeState(state, player2);
    expect(p2Sanitized.myState.secretWord).toBe('REACT');
    expect(p2Sanitized.opponentState.secretWord).toBeUndefined(); // NEVER transmitted!
    expect(p2Sanitized.opponentState.wordLength).toBe(6);
  });

  it('handles letter query matching and turns', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'submit_word', word: 'PYTHON' }).newState!;
    state = game.handleAction(state, player2, { type: 'submit_word', word: 'REACT' }).newState!;

    // Player 1 queries 'E' in 'REACT' -> match at index 1
    const q1 = game.handleAction(state, player1, { type: 'letter_query', letter: 'E' });
    expect(q1.success).toBe(true);
    state = q1.newState!;

    expect(state.players[player2].revealedPositions[1]).toBe('E');
    expect(state.players[player1].letterQueriesUsed).toBe(1);
    expect(state.players[player1].strikes).toBe(0);
    expect(state.activeTurnPlayerId).toBe(player2); // Turn switched!

    // Player 2 queries 'Z' in 'PYTHON' -> miss
    const q2 = game.handleAction(state, player2, { type: 'letter_query', letter: 'Z' });
    expect(q2.success).toBe(true);
    state = q2.newState!;
    expect(state.players[player2].strikes).toBe(1);
    expect(state.activeTurnPlayerId).toBe(player1);
  });

  it('handles full word guess and win resolution', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'submit_word', word: 'PYTHON' }).newState!;
    state = game.handleAction(state, player2, { type: 'submit_word', word: 'REACT' }).newState!;

    // Player 1 correctly guesses 'REACT'
    const guessRes = game.handleAction(state, player1, { type: 'submit_guess', guess: 'REACT' });
    expect(guessRes.success).toBe(true);
    state = guessRes.newState!;

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(player1);

    // After finish, sanitized state reveals both words
    const p2Sanitized = game.sanitizeState(state, player2);
    expect(p2Sanitized.opponentState.secretWord).toBe('PYTHON');
    expect(p2Sanitized.winnerPlayerId).toBe(player1);
  });
});
