import { ConnectedPlayer, PlayerProfile } from './profile';

export type RoomGameStatus = 'lobby' | 'setup' | 'playing' | 'finished' | 'abandoned';

export interface RoomPlayerSummary {
  sessionId: string;
  profile: PlayerProfile;
  isOnline: boolean;
  isReady: boolean;
  colorRole: 'primary' | 'secondary';
  reconnectGraceSecondsLeft?: number;
}

export interface RoomState<TGameState = any> {
  roomId: string;
  gameId: string;
  players: [RoomPlayerSummary, RoomPlayerSummary];
  gameStatus: RoomGameStatus;
  gameState?: TGameState;
  rematchVotes: Record<string, boolean>; // sessionId -> wants rematch
  createdAt: number;
}
