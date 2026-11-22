import {
  GameDefinition,
  ValidationResult,
  ActionResult,
  GameCompletionResult,
  AUCTION_CONFIG,
  AVAILABLE_GAMES,
  AuctionServerState,
  AuctionClientState,
  AuctionAction,
  AuctionItem,
  AuctionItemResult,
} from '@tether/shared';
import { scenarioService, PreparedScenario } from '../services/scenarioService';

export class SurvivalAuctionGame implements GameDefinition<AuctionServerState, AuctionClientState, AuctionAction> {
  public id = 'quantum-bazaar';
  public name = 'Survival Auction';
  public description =
    'An AI-hosted survival scenario. Same starting budget, open bidding wars lot by lot — see their raise, then outbid or fold.';
  public summary = AVAILABLE_GAMES.find((g) => g.id === 'quantum-bazaar')!;
  public minPlayers = 2;
  public maxPlayers = 2;

  public createInitialState(playerIds: [string, string]): AuctionServerState {
    const prepared: PreparedScenario = scenarioService.takeScenario();

    return {
      roomId: '',
      gameId: 'quantum-bazaar',
      phase: 'bidding',
      playerIds,
      scenario: prepared.scenario,
      items: prepared.items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        baseValue: it.baseValue,
      })),
      currentItemIndex: 0,
      // Opening turn alternates per lot for fairness
      activeBidderId: playerIds[0],
      highBid: null,
      bidHistory: [],
      budgets: {
        [playerIds[0]]: prepared.scenario.budget,
        [playerIds[1]]: prepared.scenario.budget,
      },
      startedAt: Date.now(),
      winnerPlayerId: null,
      finishReason: undefined,
    };
  }

  public validateAction(state: AuctionServerState, playerId: string, action: AuctionAction): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, reason: 'Player not in this game room' };
    }

    if (state.phase === 'finished') {
      return { valid: false, reason: 'Game has already finished' };
    }

    const item = state.items[state.currentItemIndex];
    if (!item) {
      return { valid: false, reason: 'No active auction item' };
    }

    switch (action.type) {
      case 'bid': {
        if (state.phase !== 'bidding') {
          return { valid: false, reason: 'This lot is no longer open for bidding' };
        }
        if (state.activeBidderId !== playerId) {
          return { valid: false, reason: 'It is your companion\'s turn to bid' };
        }
        if (action.itemId !== item.id) {
          return { valid: false, reason: 'Bid must target the current lot' };
        }
        const amount = Math.round(Number(action.amount));
        if (!Number.isFinite(amount)) {
          return { valid: false, reason: 'Bid must be a number' };
        }
        const minNext = this.minNextBid(state);
        if (amount < minNext) {
          return {
            valid: false,
            reason: state.highBid
              ? `You must raise to at least $${minNext} (high bid $${state.highBid.amount} + $${AUCTION_CONFIG.MIN_BID_INCREMENT})`
              : `Opening bid must be at least $${minNext}`,
          };
        }
        const remaining = state.budgets[playerId];
        if (amount > remaining) {
          return { valid: false, reason: `You only have $${remaining} left — fold instead` };
        }
        return { valid: true };
      }

      case 'fold': {
        if (state.phase !== 'bidding') {
          return { valid: false, reason: 'This lot is already settled' };
        }
        if (state.activeBidderId !== playerId) {
          return { valid: false, reason: 'It is your companion\'s turn to bid' };
        }
        return { valid: true };
      }

      case 'next_item': {
        if (state.phase !== 'reveal') {
          return { valid: false, reason: 'The bidding war must end first' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown action type' };
    }
  }

  public handleAction(state: AuctionServerState, playerId: string, action: AuctionAction): ActionResult<AuctionServerState> {
    const validation = this.validateAction(state, playerId, action);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const newState: AuctionServerState = {
      ...state,
      items: state.items.map((it) => ({ ...it })),
      highBid: state.highBid ? { ...state.highBid } : null,
      bidHistory: [...state.bidHistory],
      budgets: { ...state.budgets },
    };
    const item = newState.items[newState.currentItemIndex];
    const [p1, p2] = newState.playerIds;
    const opponentId = playerId === p1 ? p2 : p1;

    switch (action.type) {
      case 'bid': {
        const amount = Math.round(Number(action.amount));
        newState.highBid = { playerId, amount };
        newState.bidHistory.push({ playerId, amount, at: Date.now() });
        // Turn passes so the opponent can outbid — bids stay public
        newState.activeBidderId = opponentId;
        return { success: true, newState };
      }

      case 'fold': {
        // Whoever holds the high bid wins and pays it; no high bid = unsold lot
        if (newState.highBid) {
          this.sellItem(newState, item, newState.highBid.playerId, newState.highBid.amount);
        } else {
          item.unsold = true;
          item.soldToPlayerId = null;
        }
        newState.phase = 'reveal';
        return { success: true, newState };
      }

      case 'next_item': {
        if (newState.currentItemIndex >= newState.items.length - 1) {
          // Catalog exhausted — settle the match
          newState.phase = 'finished';
          this.crownWinner(newState);
          this.calculateStats(newState);
          return { success: true, newState };
        }

        newState.currentItemIndex += 1;
        newState.highBid = null;
        newState.bidHistory = [];
        // Fair start: the player who did NOT open this lot opens the next one
        newState.activeBidderId = newState.currentItemIndex % 2 === 0 ? newState.playerIds[0] : newState.playerIds[1];
        newState.phase = 'bidding';
        return { success: true, newState };
      }

      default:
        return { success: false, error: 'Unhandled action' };
    }
  }

  public sanitizeState(state: AuctionServerState, playerId: string): AuctionClientState {
    const opponentId = state.playerIds.find((id) => id !== playerId) || state.playerIds[0];
    const isReveal = state.phase === 'reveal';
    const isFinished = state.phase === 'finished';

    const item = state.items[state.currentItemIndex];
    const minNext = this.minNextBid(state);
    const currentItem = item && !isFinished
      ? {
          name: item.name,
          description: item.description,
          baseValue: item.baseValue,
          highBidPlayerId: state.highBid?.playerId ?? null,
          highBidAmount: state.highBid?.amount,
          minNextBid: minNext,
          bidHistory: state.bidHistory,
          isMyTurn: state.activeBidderId === playerId,
          canAfford: state.budgets[playerId] !== undefined && state.budgets[playerId] >= minNext,
          winnerPlayerId: isReveal ? item.soldToPlayerId : undefined,
          unsold: isReveal ? item.unsold : undefined,
        }
      : undefined;

    // Every resolved lot is public knowledge (who won what, at what price)
    const results: AuctionItemResult[] = state.items
      .filter((it) => it.soldToPlayerId !== undefined || it.unsold)
      .map((it) => ({
        itemId: it.id,
        name: it.name,
        description: it.description,
        winnerPlayerId: it.soldToPlayerId,
        price: it.soldPrice,
        unsold: it.unsold,
      }));

    return {
      roomId: state.roomId,
      gameId: 'quantum-bazaar',
      phase: state.phase,
      playerIds: state.playerIds,
      scenario: state.scenario,
      items: state.items,
      currentItemIndex: state.currentItemIndex,
      currentItem,
      myMoney: state.budgets[playerId] ?? 0,
      opponentMoney: state.budgets[opponentId] ?? 0,
      results,
      winnerPlayerId: state.winnerPlayerId,
      finishReason: state.finishReason,
      stats: state.stats,
    };
  }

  public checkCompletion(state: AuctionServerState): GameCompletionResult {
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

  private minNextBid(state: AuctionServerState): number {
    return state.highBid
      ? state.highBid.amount + AUCTION_CONFIG.MIN_BID_INCREMENT
      : AUCTION_CONFIG.OPENING_MIN_BID;
  }

  private sellItem(state: AuctionServerState, item: AuctionItem, winnerId: string, price: number): void {
    item.soldToPlayerId = winnerId;
    item.soldPrice = price;
    state.budgets[winnerId] = (state.budgets[winnerId] ?? 0) - price;
  }

  private crownWinner(state: AuctionServerState): void {
    const [p1, p2] = state.playerIds;
    const p1Items = state.items.filter((it) => it.soldToPlayerId === p1).length;
    const p2Items = state.items.filter((it) => it.soldToPlayerId === p2).length;

    if (p1Items > p2Items) {
      state.winnerPlayerId = p1;
    } else if (p2Items > p1Items) {
      state.winnerPlayerId = p2;
    } else if ((state.budgets[p1] ?? 0) > (state.budgets[p2] ?? 0)) {
      state.winnerPlayerId = p1; // same haul, more cash left — thriftier survivor
    } else if ((state.budgets[p2] ?? 0) > (state.budgets[p1] ?? 0)) {
      state.winnerPlayerId = p2;
    } else {
      state.winnerPlayerId = null; // perfect tie
    }

    state.finishReason =
      state.winnerPlayerId === null
        ? 'Dead-even survival kits. You two are worryingly compatible.'
        : `${state.winnerPlayerId === p1 ? p1Items : p2Items} items vs ${state.winnerPlayerId === p1 ? p2Items : p1Items} — the better stocked survivor wins.`;
  }

  private calculateStats(state: AuctionServerState): void {
    const [p1, p2] = state.playerIds;
    state.stats = {
      itemsSold: state.items.filter((it) => it.soldToPlayerId).length,
      totalSpent: state.items.reduce((sum, it) => sum + (it.soldPrice || 0), 0),
      p1Items: state.items.filter((it) => it.soldToPlayerId === p1).length,
      p2Items: state.items.filter((it) => it.soldToPlayerId === p2).length,
      durationSeconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
    };
  }
}

export const survivalAuctionGame = new SurvivalAuctionGame();
