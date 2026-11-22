export type AuctionPhase = 'bidding' | 'reveal' | 'finished';

/** One public bid in the open bidding war for the CURRENT item. */
export interface AuctionBidEntry {
  playerId: string;
  amount: number;
  at: number;
}

/** One item up for auction in a scenario. */
export interface AuctionItem {
  id: string;
  name: string;
  description: string;
  baseValue: number; // suggested price shown to both players
  soldToPlayerId?: string | null; // set once resolved
  soldPrice?: number;
  unsold?: boolean; // nobody wanted it / no opening bid
}

/** AI / fallback generated survival scenario. */
export interface AuctionScenario {
  title: string;
  situation: string;
  days: number;
  budget: number;
}

export interface AuctionServerState {
  roomId: string;
  gameId: 'quantum-bazaar';
  phase: AuctionPhase;
  playerIds: [string, string];
  scenario: AuctionScenario;
  items: AuctionItem[]; // the full catalog, auctioned in order
  currentItemIndex: number;
  activeBidderId: string; // whose turn it is to raise or fold
  highBid: { playerId: string; amount: number } | null; // current winning bid (PUBLIC)
  bidHistory: AuctionBidEntry[]; // bids for the CURRENT item only
  budgets: Record<string, number>; // remaining money per player
  startedAt: number;
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    itemsSold: number;
    totalSpent: number;
    p1Items: number;
    p2Items: number;
    durationSeconds: number;
  };
}

export interface AuctionItemResult {
  itemId: string;
  name: string;
  description: string;
  winnerPlayerId?: string | null;
  price?: number;
  unsold?: boolean;
}

/**
 * Client-sanitized state. Bids are PUBLIC the moment they are placed so the
 * opponent can outbid — that is the whole game.
 */
export interface AuctionClientState {
  roomId: string;
  gameId: 'quantum-bazaar';
  phase: AuctionPhase;
  playerIds: [string, string];
  scenario: AuctionScenario;
  items: AuctionItem[];
  currentItemIndex: number;
  currentItem?: {
    name: string;
    description: string;
    baseValue: number;
    highBidPlayerId?: string | null;
    highBidAmount?: number;
    minNextBid: number; // what a raise must beat (or the opening minimum)
    bidHistory: AuctionBidEntry[];
    isMyTurn: boolean;
    canAfford: boolean; // can I cover minNextBid? (else folding is the only move)
    winnerPlayerId?: string | null; // reveal only
    unsold?: boolean; // reveal only
  };
  myMoney: number;
  opponentMoney: number;
  results: AuctionItemResult[]; // resolved items so far (public)
  winnerPlayerId?: string | null;
  finishReason?: string;
  stats?: {
    itemsSold: number;
    totalSpent: number;
    p1Items: number;
    p2Items: number;
    durationSeconds: number;
  };
}

export type AuctionAction =
  | { type: 'bid'; itemId: string; amount: number }
  | { type: 'fold' }
  | { type: 'next_item' };
