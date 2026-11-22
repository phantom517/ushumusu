import { describe, expect, it } from 'bun:test';
import { SurvivalAuctionGame } from './auction';
import { AuctionServerState } from '@tether/shared';

describe('Survival Auction Server Logic (open bidding)', () => {
  const game = new SurvivalAuctionGame();
  const player1 = 'p1-session';
  const player2 = 'p2-session';

  it('initializes with scenario, item catalog and equal budgets', () => {
    const state = game.createInitialState([player1, player2]);
    expect(state.phase).toBe('bidding');
    expect(state.gameId).toBe('quantum-bazaar');
    expect(state.scenario.title.length).toBeGreaterThan(0);
    expect(state.items.length).toBeGreaterThanOrEqual(6);
    expect(state.items.length).toBeLessThanOrEqual(10);
    expect(state.budgets[player1]).toBe(state.scenario.budget);
    expect(state.budgets[player2]).toBe(state.scenario.budget);
    expect(state.activeBidderId).toBe(player1); // p1 opens lot 1
    expect(state.highBid).toBeNull();
  });

  it('publishes bids instantly so the opponent can outbid', () => {
    let state = game.createInitialState([player1, player2]);
    const itemId = state.items[0].id;

    state = game.handleAction(state, player1, { type: 'bid', itemId, amount: 120 }).newState!;

    expect(state.highBid).toEqual({ playerId: player1, amount: 120 });
    expect(state.activeBidderId).toBe(player2); // turn passes immediately

    // BOTH views see the high bid — that is the whole point of open bidding
    const p2View = game.sanitizeState(state, player2);
    expect(p2View.currentItem!.highBidAmount).toBe(120);
    expect(p2View.currentItem!.highBidPlayerId).toBe(player1);
    expect(p2View.currentItem!.minNextBid).toBe(130); // +$10 increment
    expect(p2View.currentItem!.isMyTurn).toBe(true);
    expect(p2View.currentItem!.bidHistory.length).toBe(1);

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.currentItem!.isMyTurn).toBe(false);
  });

  it('enforces minimum raise and budget caps', () => {
    let state = game.createInitialState([player1, player2]);
    const itemId = state.items[0].id;

    // below opening minimum
    expect(game.handleAction(state, player1, { type: 'bid', itemId, amount: 0 }).success).toBe(false);
    // negative
    expect(game.handleAction(state, player1, { type: 'bid', itemId, amount: -5 }).success).toBe(false);
    // wrong item
    expect(game.handleAction(state, player1, { type: 'bid', itemId: state.items[1].id, amount: 50 }).success).toBe(false);
    // over budget
    expect(game.handleAction(state, player1, { type: 'bid', itemId, amount: state.scenario.budget + 1 }).success).toBe(false);

    state = game.handleAction(state, player1, { type: 'bid', itemId, amount: 120 }).newState!;
    // out of turn
    expect(game.handleAction(state, player1, { type: 'bid', itemId, amount: 130 }).success).toBe(false);
    // raise too small (must be >= high + increment)
    expect(game.handleAction(state, player2, { type: 'bid', itemId, amount: 125 }).success).toBe(false);

    // valid raise
    state = game.handleAction(state, player2, { type: 'bid', itemId, amount: 150 }).newState!;
    expect(state.highBid).toEqual({ playerId: player2, amount: 150 });
    expect(state.activeBidderId).toBe(player1);
  });

  it('settles the lot when a player folds: high bidder wins and pays', () => {
    let state = game.createInitialState([player1, player2]);
    const itemId = state.items[0].id;

    state = game.handleAction(state, player1, { type: 'bid', itemId, amount: 200 }).newState!;
    state = game.handleAction(state, player2, { type: 'bid', itemId, amount: 250 }).newState!;
    state = game.handleAction(state, player1, { type: 'fold' }).newState!;

    expect(state.phase).toBe('reveal');
    expect(state.items[0].soldToPlayerId).toBe(player2);
    expect(state.items[0].soldPrice).toBe(250);
    expect(state.budgets[player2]).toBe(state.scenario.budget - 250);
    expect(state.budgets[player1]).toBe(state.scenario.budget); // loser pays nothing

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.currentItem!.winnerPlayerId).toBe(player2);
    expect(p1View.results.length).toBe(1);
  });

  it('folding with no bids leaves the lot unsold', () => {
    let state = game.createInitialState([player1, player2]);
    state = game.handleAction(state, player1, { type: 'fold' }).newState!;

    expect(state.phase).toBe('reveal');
    expect(state.items[0].unsold).toBe(true);
    expect(state.items[0].soldToPlayerId).toBeNull();
    expect(state.budgets[player1]).toBe(state.scenario.budget);
    expect(state.budgets[player2]).toBe(state.scenario.budget);
  });

  it('marks canAfford=false when the wallet cannot cover the raise', () => {
    let state = game.createInitialState([player1, player2]);
    const itemId = state.items[0].id;
    const budget = state.scenario.budget;

    // p1 bids nearly everything, p2 outbids with their full budget
    state = game.handleAction(state, player1, { type: 'bid', itemId, amount: budget - 50 }).newState!;
    state = game.handleAction(state, player2, { type: 'bid', itemId, amount: budget }).newState!;

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.myMoney).toBe(budget); // money is only paid when a lot is WON
    expect(p1View.currentItem!.minNextBid).toBe(budget + 10);
    expect(p1View.currentItem!.canAfford).toBe(false); // only folding makes sense now
  });

  it('runs a full match to completion and crowns a winner', () => {
    let state = game.createInitialState([player1, player2]);
    const total = state.items.length;

    for (let i = 0; i < total; i++) {
      const itemId = state.items[i].id;

      if (i % 2 === 0) {
        // Even lots: p1 opens, p2 outbids, p1 folds -> p2 wins at 150
        state = game.handleAction(state, player1, { type: 'bid', itemId, amount: 100 }).newState!;
        state = game.handleAction(state, player2, { type: 'bid', itemId, amount: 150 }).newState!;
        state = game.handleAction(state, player1, { type: 'fold' }).newState!;
      } else {
        // Odd lots: p2 opens (alternated turn), p1 folds immediately -> p2 wins at 100
        state = game.handleAction(state, player2, { type: 'bid', itemId, amount: 100 }).newState!;
        state = game.handleAction(state, player1, { type: 'fold' }).newState!;
      }
      expect(state.phase).toBe('reveal');

      if (i < total - 1) {
        state = game.handleAction(state, player2, { type: 'next_item' }).newState!;
        expect(state.phase).toBe('bidding');
        expect(state.currentItemIndex).toBe(i + 1);
        expect(state.highBid).toBeNull();
        expect(state.bidHistory.length).toBe(0);
      } else {
        state = game.handleAction(state, player2, { type: 'next_item' }).newState!;
      }
    }

    expect(state.phase).toBe('finished');
    expect(state.winnerPlayerId).toBe(player2); // won every lot
    expect(state.stats!.p2Items).toBe(total);
    expect(state.stats!.p1Items).toBe(0);

    const completion = game.checkCompletion(state);
    expect(completion.isFinished).toBe(true);

    const p1View = game.sanitizeState(state, player1);
    expect(p1View.currentItem).toBeUndefined();
    expect(p1View.results.length).toBe(total);
  });

  it('alternates the opening bidder per lot', () => {
    let state = game.createInitialState([player1, player2]);
    expect(state.activeBidderId).toBe(player1); // lot 1 (index 0)

    const itemId = state.items[0].id;
    state = game.handleAction(state, player1, { type: 'bid', itemId, amount: 50 }).newState!;
    state = game.handleAction(state, player2, { type: 'fold' }).newState!;
    state = game.handleAction(state, player1, { type: 'next_item' }).newState!;

    expect(state.activeBidderId).toBe(player2); // lot 2 (index 1)
  });

  it('rejects actions from players outside the room', () => {
    const state = game.createInitialState([player1, player2]);
    expect(
      game.handleAction(state, 'intruder', { type: 'bid', itemId: state.items[0].id, amount: 10 }).success
    ).toBe(false);
    expect(game.handleAction(state, 'intruder', { type: 'fold' }).success).toBe(false);
  });
});
