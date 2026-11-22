import { PlayerProfile } from './profile';

export type MatchmakingStatus = 'idle' | 'searching' | 'matched' | 'error';

export interface MatchmakingJoinPayload {
  gameId: string;
  pairingSecret?: string;
}

export interface MatchmakingStatusPayload {
  status: MatchmakingStatus;
  gameId?: string;
  queueLength?: number;
  message?: string;
}

export interface MatchFoundPayload {
  roomId: string;
  gameId: string;
  opponent: PlayerProfile;
  assignedColor: 'primary' | 'secondary'; // Terracotta for Player 1, Eucalyptus Sage for Player 2
}
