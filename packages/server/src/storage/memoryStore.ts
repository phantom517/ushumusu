import { ConnectedPlayer, RoomState } from '@tether/shared';

export interface ServerRoom {
  roomId: string;
  gameId: string;
  playerSessionIds: [string, string];
  connectionStates: Record<string, 'connected' | 'disconnected'>;
  readyStates: Record<string, boolean>;
  colorRoles: Record<string, 'primary' | 'secondary'>;
  gameStatus: 'lobby' | 'setup' | 'playing' | 'finished' | 'abandoned';
  gameState: any; // Server authoritative state
  rematchVotes: Record<string, boolean>;
  createdAt: number;
  graceTimer?: ReturnType<typeof setTimeout> | null;
  graceTicker?: ReturnType<typeof setInterval> | null;
  graceRemainingSeconds?: number;
}

export interface DisconnectedSessionInfo {
  sessionToken: string;
  originalPlayerId: string;
  roomId?: string;
  disconnectedAt: number;
  expiresAt: number;
}

class MemoryStore {
  // Connected player sessions keyed by temporary session token
  public players = new Map<string, ConnectedPlayer>();

  // Map socket.id -> session token for fast lookup
  public socketToSession = new Map<string, string>();

  // Matchmaking queues: gameId -> Set of waiting player session tokens
  public waitingQueues = new Map<string, Set<string>>();

  // Active game rooms keyed by unique room ID
  public rooms = new Map<string, ServerRoom>();

  // Temporarily disconnected sessions pending reconnection
  public disconnectedSessions = new Map<string, DisconnectedSessionInfo>();

  public getPlayerBySocket(socketId: string): ConnectedPlayer | undefined {
    const sessionToken = this.socketToSession.get(socketId);
    if (!sessionToken) return undefined;
    return this.players.get(sessionToken);
  }

  public getPlayerBySession(sessionToken: string): ConnectedPlayer | undefined {
    return this.players.get(sessionToken);
  }

  public getRoomByPlayerSession(sessionToken: string): ServerRoom | undefined {
    const player = this.players.get(sessionToken);
    if (!player || !player.currentRoomId) return undefined;
    return this.rooms.get(player.currentRoomId);
  }

  public clearQueueForPlayer(sessionToken: string): void {
    for (const [gameId, queue] of this.waitingQueues.entries()) {
      if (queue.has(sessionToken)) {
        queue.delete(sessionToken);
      }
    }
  }

  public getStats() {
    return {
      connectedPlayers: this.players.size,
      activeRooms: this.rooms.size,
      queuedPlayers: Array.from(this.waitingQueues.values()).reduce((acc, q) => acc + q.size, 0),
      disconnectedPending: this.disconnectedSessions.size,
    };
  }
}

export const memoryStore = new MemoryStore();
