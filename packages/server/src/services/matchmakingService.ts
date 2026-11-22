import { Server as SocketIOServer } from 'socket.io';
import { memoryStore, ServerRoom } from '../storage/memoryStore';
import { gameRegistry } from '../games/registry';
import { roomService } from './roomService';
import { config } from '../config';

export class MatchmakingService {
  private io: SocketIOServer | null = null;

  public setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  public joinQueue(
    sessionToken: string,
    gameId: string,
    pairingSecret?: string
  ): { success: boolean; matchedRoom?: ServerRoom; error?: string } {
    const player = memoryStore.players.get(sessionToken);
    if (!player) {
      return { success: false, error: 'Player session not found' };
    }

    // Security: Check pairing secret restriction
    const secretProvided = pairingSecret || player.profile.pairingSecret;
    if (config.pairingSecret && secretProvided !== config.pairingSecret) {
      return {
        success: false,
        error: 'Invalid pairing passkey. Please check your shared secret in Settings.',
      };
    }

    // Validate game existence
    if (!gameRegistry.isSupported(gameId)) {
      return { success: false, error: `Game '${gameId}' is not available` };
    }

    // Check if player is already in an active room
    if (player.currentRoomId) {
      const existingRoom = memoryStore.rooms.get(player.currentRoomId);
      if (existingRoom && existingRoom.gameStatus !== 'abandoned') {
        return {
          success: false,
          error: 'You are already in an active game room. Leave or finish it first.',
        };
      }
    }

    // Remove from any existing waiting queues to prevent multiple queues
    memoryStore.clearQueueForPlayer(sessionToken);

    // Get or create queue for this specific game
    let queue = memoryStore.waitingQueues.get(gameId);
    if (!queue) {
      queue = new Set<string>();
      memoryStore.waitingQueues.set(gameId, queue);
    }

    // Check if another player is already waiting
    let opponentSession: string | undefined;
    for (const waitingId of queue) {
      if (waitingId !== sessionToken) {
        const waitingPlayer = memoryStore.players.get(waitingId);
        // Ensure waiting player is still online
        if (waitingPlayer && waitingPlayer.isOnline) {
          opponentSession = waitingId;
          break;
        } else {
          // Stale entry, remove
          queue.delete(waitingId);
        }
      }
    }

    if (opponentSession) {
      // Remove opponent from queue atomically
      queue.delete(opponentSession);

      // Create new room
      const room = roomService.createRoom(gameId, opponentSession, sessionToken);

      const opponentPlayer = memoryStore.players.get(opponentSession)!;

      // Notify opponent
      if (this.io) {
        this.io.to(opponentPlayer.socketId).emit('matchmaking:matched', {
          roomId: room.roomId,
          gameId: room.gameId,
          opponent: player.profile,
          assignedColor: 'primary',
        });

        // Notify joining player
        this.io.to(player.socketId).emit('matchmaking:matched', {
          roomId: room.roomId,
          gameId: room.gameId,
          opponent: opponentPlayer.profile,
          assignedColor: 'secondary',
        });
      }

      // Broadcast room states
      roomService.broadcastRoomState(room);

      return { success: true, matchedRoom: room };
    } else {
      // Add player to queue
      queue.add(sessionToken);

      // Notify player of waiting status
      if (this.io) {
        this.io.to(player.socketId).emit('matchmaking:status', {
          status: 'searching',
          gameId,
          queueLength: queue.size,
          message: 'Waiting for your companion to join...',
        });
      }

      return { success: true };
    }
  }

  public cancelQueue(sessionToken: string): boolean {
    memoryStore.clearQueueForPlayer(sessionToken);
    const player = memoryStore.players.get(sessionToken);
    if (player && this.io) {
      this.io.to(player.socketId).emit('matchmaking:status', {
        status: 'idle',
        message: 'Matchmaking cancelled',
      });
    }
    return true;
  }

  public handleDisconnect(sessionToken: string): void {
    memoryStore.clearQueueForPlayer(sessionToken);
  }
}

export const matchmakingService = new MatchmakingService();
