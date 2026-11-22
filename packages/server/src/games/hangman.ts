import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  HangmanServerState,
  HangmanClientState,
  HangmanAction,
  PlayerHangmanState,
  InquiryLedgerItem,
  AVAILABLE_GAMES,
  HANGMAN_CONFIG,
  validateSecretWord,
} from '@tether/shared';
import { v4 as uuidv4 } from 'uuid';

export class CodingHangmanGame implements GameDefinition<HangmanServerState, HangmanClientState, HangmanAction> {
  public id = 'coding-hangman';
  public name = 'Guess My Answer';
  public description =
    'One of you hides a secret answer, the other peeks at it letter by letter — asking sweet questions along the way.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'coding-hangman')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): HangmanServerState {
    const players: Record<string, PlayerHangmanState> = {};

    for (const pid of playerIds) {
      players[pid] = {
        playerId: pid,
        hasSubmittedWord: false,
        wordLength: 0,
        revealedPositions: {},
        queriedLetters: [],
        letterQueriesUsed: 0,
        strikes: 0,
        maxLetterQueries: HANGMAN_CONFIG.MAX_LETTER_QUERIES,
        maxStrikes: HANGMAN_CONFIG.MAX_STRIKES,
        phase: 'submitting',
        unlockedFreeForm: false,
        hasWon: false,
      };
    }

    return {
      roomId: '',
      gameId: 'coding-hangman',
      phase: 'secret_submission',
      playerIds,
      players,
      activeTurnPlayerId: playerIds[0], // Player 1 starts when Phase 1 begins
      pendingQuestion: null,
      ledger: [],
      startedAt: Date.now(),
      turnStartedAt: Date.now(),
      winnerPlayerId: null,
      finishReason: undefined,
    };
  }

  public validateAction(state: HangmanServerState, playerId: string, action: HangmanAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase === 'finished') {
      return { valid: false, reason: 'Game has already finished' };
    }

    const opponentId = state.playerIds.find((id) => id !== playerId)!;
    const playerState = state.players[playerId];

    switch (action.type) {
      case 'submit_word': {
        if (state.phase !== 'secret_submission') {
          return { valid: false, reason: 'Word submission phase has ended' };
        }
        if (playerState.hasSubmittedWord) {
          return { valid: false, reason: 'Secret word already submitted' };
        }
        const validation = validateSecretWord(action.word);
        if (!validation.valid) {
          return { valid: false, reason: validation.error };
        }
        return { valid: true };
      }

      case 'letter_query': {
        if (state.phase === 'secret_submission') {
          return { valid: false, reason: 'Both players must submit secret words first' };
        }
        if (state.pendingQuestion) {
          return { valid: false, reason: 'Pending question must be answered first' };
        }
        if (state.activeTurnPlayerId !== playerId) {
          return { valid: false, reason: "It is your companion's turn" };
        }
        if (playerState.letterQueriesUsed >= playerState.maxLetterQueries) {
          return {
            valid: false,
            reason: 'You have exhausted your 10 letter queries. Free-form clues are now unlocked!',
          };
        }
        const letter = action.letter?.trim().toUpperCase();
        if (!letter || letter.length !== 1 || !/^[A-Z]$/.test(letter)) {
          return { valid: false, reason: 'Must query exactly one letter (A-Z)' };
        }
        if (playerState.queriedLetters.includes(letter)) {
          return { valid: false, reason: `Letter '${letter}' has already been queried` };
        }
        return { valid: true };
      }

      case 'submit_question': {
        if (state.phase === 'secret_submission') {
          return { valid: false, reason: 'Words not yet submitted' };
        }
        if (state.pendingQuestion) {
          return { valid: false, reason: 'An active question is already awaiting an answer' };
        }
        if (state.activeTurnPlayerId !== playerId) {
          return { valid: false, reason: "It is your companion's turn" };
        }
        if (!playerState.unlockedFreeForm && playerState.letterQueriesUsed < playerState.maxLetterQueries) {
          return {
            valid: false,
            reason: `Free-form clues unlock after using ${playerState.maxLetterQueries} letter queries`,
          };
        }
        const q = action.question?.trim();
        if (!q || q.length < 3 || q.length > 200) {
          return { valid: false, reason: 'Question must be between 3 and 200 characters' };
        }
        return { valid: true };
      }

      case 'submit_answer': {
        if (!state.pendingQuestion) {
          return { valid: false, reason: 'No pending question to answer' };
        }
        if (state.pendingQuestion.targetPlayerId !== playerId) {
          return { valid: false, reason: 'Only the asked companion can answer this question' };
        }
        if (state.pendingQuestion.id !== action.questionId) {
          return { valid: false, reason: 'Question ID mismatch' };
        }
        const ans = action.answer?.trim();
        if (!ans || ans.length === 0 || ans.length > 200) {
          return { valid: false, reason: 'Answer cannot be empty or exceed 200 characters' };
        }
        return { valid: true };
      }

      case 'submit_guess': {
        if (state.phase === 'secret_submission') {
          return { valid: false, reason: 'Game has not started yet' };
        }
        if (state.pendingQuestion) {
          return { valid: false, reason: 'Please answer the pending question first' };
        }
        if (state.activeTurnPlayerId !== playerId) {
          return { valid: false, reason: "It is your companion's turn" };
        }
        const guess = action.guess?.trim().toUpperCase();
        if (!guess || guess.length < HANGMAN_CONFIG.MIN_WORD_LENGTH) {
          return { valid: false, reason: 'Invalid word guess' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: HangmanServerState, playerId: string, action: HangmanAction): ActionResult<HangmanServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const opponentId = state.playerIds.find((id) => id !== playerId)!;
    const playerState = state.players[playerId];
    const opponentState = state.players[opponentId];
    const now = Date.now();

    // Clone state
    const newState: HangmanServerState = {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...playerState },
        [opponentId]: { ...opponentState },
      },
      ledger: [...state.ledger],
    };

    switch (action.type) {
      case 'submit_word': {
        const { normalized } = validateSecretWord(action.word);
        newState.players[playerId].secretWord = normalized;
        newState.players[playerId].hasSubmittedWord = true;
        newState.players[playerId].wordLength = normalized.length;

        // Check if both players have submitted words
        const bothSubmitted = newState.playerIds.every((id) => newState.players[id].hasSubmittedWord);
        if (bothSubmitted) {
          newState.phase = 'letter_queries';
          newState.turnStartedAt = now;
          newState.players[playerId].phase = 'letters';
          newState.players[opponentId].phase = 'letters';
          newState.ledger.push({
            id: uuidv4(),
            playerId: 'system',
            type: 'letter',
            question: 'Both ciphers locked. Phase 1 Letter Inquiries initiated.',
            timestamp: now,
          });
        }
        return { success: true, newState };
      }

      case 'letter_query': {
        const letter = action.letter.trim().toUpperCase();
        const opponentWord = opponentState.secretWord || '';
        const matchingIndices: number[] = [];

        for (let i = 0; i < opponentWord.length; i++) {
          if (opponentWord[i] === letter) {
            matchingIndices.push(i);
          }
        }

        const isFound = matchingIndices.length > 0;
        newState.players[playerId].queriedLetters.push(letter);
        newState.players[playerId].letterQueriesUsed += 1;

        if (isFound) {
          // Reveal matching indices in opponent's word
          for (const idx of matchingIndices) {
            newState.players[opponentId].revealedPositions[idx] = letter;
          }
        } else {
          // Increment strike
          newState.players[playerId].strikes += 1;
        }

        // Ledger record
        newState.ledger.push({
          id: uuidv4(),
          playerId,
          type: 'letter',
          letter,
          foundCount: matchingIndices.length,
          positions: matchingIndices,
          isCorrect: isFound,
          timestamp: now,
        });

        // Check if 10 queries exhausted -> unlock free form for this player
        if (newState.players[playerId].letterQueriesUsed >= newState.players[playerId].maxLetterQueries) {
          newState.players[playerId].unlockedFreeForm = true;
          newState.players[playerId].phase = 'free_form';
        }

        // Check if all letters of opponent's word have been discovered
        const totalRevealed = Object.keys(newState.players[opponentId].revealedPositions).length;
        if (totalRevealed === opponentWord.length) {
          newState.phase = 'finished';
          newState.winnerPlayerId = playerId;
          newState.finishReason = `Solved all letters in companion's cipher!`;
          this.calculateStats(newState);
          return { success: true, newState };
        }

        // Pass turn to opponent
        newState.activeTurnPlayerId = opponentId;
        newState.turnStartedAt = now;

        return { success: true, newState };
      }

      case 'submit_question': {
        const questionText = action.question.trim();
        const questionId = uuidv4();

        newState.pendingQuestion = {
          id: questionId,
          askedByPlayerId: playerId,
          targetPlayerId: opponentId,
          questionText,
          askedAt: now,
        };

        newState.ledger.push({
          id: questionId,
          playerId,
          type: 'question',
          question: questionText,
          timestamp: now,
        });

        return { success: true, newState };
      }

      case 'submit_answer': {
        const answerText = action.answer.trim();
        const pending = newState.pendingQuestion;

        if (pending) {
          // Find corresponding ledger entry and update answer
          const ledgerIndex = newState.ledger.findIndex((item) => item.id === pending.id);
          if (ledgerIndex >= 0) {
            newState.ledger[ledgerIndex] = {
              ...newState.ledger[ledgerIndex],
              answer: answerText,
            };
          }

          newState.pendingQuestion = null;
          // Switch turn back to opponent
          newState.activeTurnPlayerId = opponentId;
          newState.turnStartedAt = now;
        }

        return { success: true, newState };
      }

      case 'submit_guess': {
        const guess = action.guess.trim().toUpperCase();
        const opponentWord = opponentState.secretWord || '';
        const isCorrect = guess === opponentWord;

        newState.ledger.push({
          id: uuidv4(),
          playerId,
          type: 'guess',
          guess,
          isCorrect,
          timestamp: now,
        });

        if (isCorrect) {
          // Guesser wins! Reveal all positions
          for (let i = 0; i < opponentWord.length; i++) {
            newState.players[opponentId].revealedPositions[i] = opponentWord[i];
          }
          newState.phase = 'finished';
          newState.winnerPlayerId = playerId;
          newState.finishReason = `Directly deciphered companion's secret word: ${opponentWord}!`;
          this.calculateStats(newState);
        } else {
          // Strike counted & pass turn
          newState.players[playerId].strikes += 1;
          newState.activeTurnPlayerId = opponentId;
          newState.turnStartedAt = now;
        }

        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: HangmanServerState, playerId: string): HangmanClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const myPlayerState = state.players[playerId] || {
      playerId,
      hasSubmittedWord: false,
      wordLength: 0,
      revealedPositions: {},
      queriedLetters: [],
      letterQueriesUsed: 0,
      strikes: 0,
      maxLetterQueries: HANGMAN_CONFIG.MAX_LETTER_QUERIES,
      maxStrikes: HANGMAN_CONFIG.MAX_STRIKES,
      phase: 'submitting',
      unlockedFreeForm: false,
      hasWon: false,
    };
    const opponentPlayerState = state.players[opponentId] || {
      playerId: opponentId,
      hasSubmittedWord: false,
      wordLength: 0,
      revealedPositions: {},
      queriedLetters: [],
      letterQueriesUsed: 0,
      strikes: 0,
      maxLetterQueries: HANGMAN_CONFIG.MAX_LETTER_QUERIES,
      maxStrikes: HANGMAN_CONFIG.MAX_STRIKES,
      phase: 'submitting',
      unlockedFreeForm: false,
      hasWon: false,
    };

    // Construct revealed letter grid for opponent's word
    const revealedLettersGrid: (string | null)[] = [];
    for (let i = 0; i < opponentPlayerState.wordLength; i++) {
      revealedLettersGrid.push(opponentPlayerState.revealedPositions[i] || null);
    }

    const isFinished = state.phase === 'finished';

    return {
      roomId: state.roomId,
      gameId: 'coding-hangman',
      phase: state.phase,
      playerIds: state.playerIds,
      activeTurnPlayerId: state.activeTurnPlayerId,
      isMyTurn: state.activeTurnPlayerId === playerId,
      myState: {
        secretWord: myPlayerState.secretWord,
        hasSubmittedWord: myPlayerState.hasSubmittedWord,
        wordLength: myPlayerState.wordLength,
        revealedPositionsByOpponent: myPlayerState.revealedPositions,
        queriedLetters: myPlayerState.queriedLetters,
        letterQueriesUsed: myPlayerState.letterQueriesUsed,
        strikes: myPlayerState.strikes,
        maxLetterQueries: myPlayerState.maxLetterQueries,
        maxStrikes: myPlayerState.maxStrikes,
        phase: myPlayerState.phase,
        unlockedFreeForm: myPlayerState.unlockedFreeForm,
      },
      opponentState: {
        hasSubmittedWord: opponentPlayerState.hasSubmittedWord,
        wordLength: opponentPlayerState.wordLength,
        revealedLettersGrid,
        revealedCount: Object.keys(opponentPlayerState.revealedPositions).length,
        queriedLetters: opponentPlayerState.queriedLetters,
        letterQueriesUsed: opponentPlayerState.letterQueriesUsed,
        strikes: opponentPlayerState.strikes,
        maxLetterQueries: opponentPlayerState.maxLetterQueries,
        maxStrikes: opponentPlayerState.maxStrikes,
        unlockedFreeForm: opponentPlayerState.unlockedFreeForm,
        // STRICT PRIVACY: Only reveal opponent secret word when game is fully finished!
        secretWord: isFinished ? opponentPlayerState.secretWord : undefined,
      },
      pendingQuestion: state.pendingQuestion,
      ledger: state.ledger,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: HangmanServerState): GameCompletionResult {
    if (state.phase === 'finished') {
      return {
        isFinished: true,
        winnerId: state.winnerPlayerId,
        reason: state.finishReason,
        finalStats: state.stats,
      };
    }
    return { isFinished: false };
  }

  private calculateStats(state: HangmanServerState): void {
    const totalInquiries = state.ledger.filter((l) => l.playerId !== 'system').length;
    const durationSeconds = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
    // High resonance metric based on inquiries and match resolution
    const correctItems = state.ledger.filter((l) => l.isCorrect).length;
    const resonancePercent = Math.min(99, Math.max(70, Math.round((correctItems / Math.max(1, totalInquiries)) * 100) + 18));

    state.stats = {
      totalInquiries,
      durationSeconds,
      resonancePercent,
    };
  }
}

export const codingHangmanGame = new CodingHangmanGame();
