export type AvatarType = 'preset' | 'icon' | 'photo' | 'custom';

export interface AvatarInfo {
  type: AvatarType;
  value: string;
}

export interface PlayerProfile {
  id: string; // Client-generated persistent local UUID
  displayName: string;
  avatar: AvatarInfo;
  disposition?: 'Quiet' | 'Playful' | 'Thoughtful' | string;
  comfortAnchor?: string;
  pairingSecret?: string;
}

export interface ConnectedPlayer {
  sessionId: string; // Server-assigned temporary session token
  profile: PlayerProfile;
  socketId: string;
  connectedAt: number;
  lastActiveAt: number;
  isOnline: boolean;
  currentRoomId?: string;
}
