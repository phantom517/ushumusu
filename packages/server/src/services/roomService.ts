import {
  RoomState,
  RoomPlayerSummary,
  RoomGameStatus,
  RECONNECTION_CONFIG,
} from '@tether/shared';
import { memoryStore, ServerRoom } from '../storage/memoryStore';
import { gameRegistry } from '../games/registry';
import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../config';

export class RoomService {
  private io: SocketIOServer | null = null;

  public setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  public createRoom(gameId: string, player1Session: string, player2Session: string): ServerRoom {
    const roomId = `room-${uuidv4().substring(0, 8)}`;
    const game = gameRegistry.get(gameId);
    if (!game) {
      throw new Error(`Game '${gameId}' is not registered`);
    }

    const initialState = game.createInitialState([player1Session, player2Session]);
    initialState.roomId = roomId;

    const room: ServerRoom = {
      roomId,
      gameId,
      playerSessionIds: [player1Session, player2Session],
      connectionStates: {
        [player1Session]: 'connected',
        [player2Session]: 'connected',
      },
      readyStates: {
        [player1Session]: false,
        [player2Session]: false,
      },
      colorRoles: {
        [player1Session]: 'primary',
        [player2Session]: 'secondary',
      },
      gameStatus: 'lobby',
      gameState: initialState,
      rematchVotes: {
        [player1Session]: false,
        [player2Session]: false,
      },
      createdAt: Date.now(),
      graceTimer: null,
      graceTicker: null,
    };

    memoryStore.rooms.set(roomId, room);

    // Update players' currentRoomId
    const p1 = memoryStore.players.get(player1Session);
    const p2 = memoryStore.players.get(player2Session);
    if (p1) p1.currentRoomId = roomId;
    if (p2) p2.currentRoomId = roomId;

    return room;
  }

  public getSanitizedRoomState(room: ServerRoom, targetSessionToken: string): RoomState {
    const summaries: RoomPlayerSummary[] = room.playerSessionIds.map((sessionId) => {
      const player = memoryStore.players.get(sessionId);
      const isOnline = room.connectionStates[sessionId] === 'connected';
      return {
        sessionId,
        profile: player?.profile || {
          id: sessionId,
          displayName: 'Companion',
          avatar: { type: 'icon', value: 'person' },
        },
        isOnline,
        isReady: !!room.readyStates[sessionId],
        colorRole: room.colorRoles[sessionId] || 'primary',
        reconnectGraceSecondsLeft: room.graceRemainingSeconds,
      };
    }) as [RoomPlayerSummary, RoomPlayerSummary];

    const game = gameRegistry.get(room.gameId);
    const sanitizedGameState = game ? game.sanitizeState(room.gameState, targetSessionToken) : room.gameState;

    return {
      roomId: room.roomId,
      gameId: room.gameId,
      players: [summaries[0], summaries[1]],
      gameStatus: room.gameStatus,
      gameState: sanitizedGameState,
      rematchVotes: room.rematchVotes,
      createdAt: room.createdAt,
    };
  }

  public setReady(room: ServerRoom, sessionToken: string, isReady: boolean): boolean {
    if (room.gameStatus !== 'lobby') {
      return false;
    }
    room.readyStates[sessionToken] = isReady;

    // Check if both ready
    const bothReady = room.playerSessionIds.every((id) => room.readyStates[id]);
    if (bothReady) {
      room.gameStatus = 'playing';
      // If coding hangman, starts in secret_submission phase
    }

    this.broadcastRoomState(room);
    return true;
  }

  public handleGameAction(
    room: ServerRoom,
    sessionToken: string,
    action: any
  ): { success: boolean; error?: string } {
    if (room.gameStatus !== 'playing') {
      return { success: false, error: 'Game is not currently active' };
    }

    const game = gameRegistry.get(room.gameId);
    if (!game) {
      return { success: false, error: 'Game definition not found' };
    }

    const result = game.handleAction(room.gameState, sessionToken, action);
    if (!result.success || !result.newState) {
      return { success: false, error: result.error || 'Action failed' };
    }

    room.gameState = result.newState;

    // Check if game completed
    const completion = game.checkCompletion(room.gameState);
    if (completion.isFinished) {
      room.gameStatus = 'finished';
      this.broadcastGameFinished(room, completion);
    } else {
      this.broadcastGameState(room);
    }

    return { success: true };
  }

  public voteRematch(
    room: ServerRoom,
    sessionToken: string,
    vote: boolean
  ): { rematchTriggered: boolean } {
    room.rematchVotes[sessionToken] = vote;

    const bothVoted = room.playerSessionIds.every((id) => room.rematchVotes[id]);
    if (bothVoted) {
      // Reset game
      const game = gameRegistry.get(room.gameId);
      if (game) {
        room.gameState = game.createInitialState(room.playerSessionIds);
        room.gameState.roomId = room.roomId;
        room.gameStatus = 'playing'; // Or back to setup/submission
        room.rematchVotes = {
          [room.playerSessionIds[0]]: false,
          [room.playerSessionIds[1]]: false,
        };
        room.readyStates = {
          [room.playerSessionIds[0]]: true,
          [room.playerSessionIds[1]]: true,
        };

        this.broadcastRoomState(room);
        this.broadcastGameState(room);
        return { rematchTriggered: true };
      }
    }

    this.broadcastRoomState(room);
    return { rematchTriggered: false };
  }

  public handlePlayerDisconnect(sessionToken: string): void {
    const room = memoryStore.getRoomByPlayerSession(sessionToken);
    if (!room) return;

    room.connectionStates[sessionToken] = 'disconnected';
    const player = memoryStore.players.get(sessionToken);
    const opponentSession = room.playerSessionIds.find((id) => id !== sessionToken);

    // Set up reconnection grace period
    const graceMs = config.reconnectionGracePeriodMs;
    const expiresAt = Date.now() + graceMs;
    room.graceRemainingSeconds = Math.round(graceMs / 1000);

    memoryStore.disconnectedSessions.set(sessionToken, {
      sessionToken,
      originalPlayerId: player?.profile.id || sessionToken,
      roomId: room.roomId,
      disconnectedAt: Date.now(),
      expiresAt,
    });

    // Clear any previous timer
    if (room.graceTimer) clearTimeout(room.graceTimer);
    if (room.graceTicker) clearInterval(room.graceTicker);

    // Notify opponent
    if (opponentSession && this.io) {
      const oppPlayer = memoryStore.players.get(opponentSession);
      if (oppPlayer?.isOnline) {
        this.io.to(oppPlayer.socketId).emit('player:opponent_disconnected', {
          graceSecondsLeft: room.graceRemainingSeconds,
          opponentName: player?.profile.displayName || 'Companion',
        });
      }
    }

    // Tick down grace seconds
    room.graceTicker = setInterval(() => {
      if (room.graceRemainingSeconds && room.graceRemainingSeconds > 0) {
        room.graceRemainingSeconds -= 1;
      }
    }, 1000);

    // Timeout expiry
    room.graceTimer = setTimeout(() => {
      if (room.graceTicker) clearInterval(room.graceTicker);
      memoryStore.disconnectedSessions.delete(sessionToken);

      // Mark room abandoned
      room.gameStatus = 'abandoned';
      if (opponentSession && this.io) {
        const oppPlayer = memoryStore.players.get(opponentSession);
        if (oppPlayer?.isOnline) {
          this.io.to(oppPlayer.socketId).emit('room:closed', {
            reason: 'Reconnection grace period expired. Companion did not return.',
          });
        }
      }

      // Cleanup room
      memoryStore.rooms.delete(room.roomId);
    }, graceMs);

    this.broadcastRoomState(room);
  }

  public handlePlayerReconnect(sessionToken: string, newSocketId: string): ServerRoom | undefined {
    const disconnectedInfo = memoryStore.disconnectedSessions.get(sessionToken);
    const player = memoryStore.players.get(sessionToken);
    if (!player) return undefined;

    player.socketId = newSocketId;
    player.isOnline = true;
    player.lastActiveAt = Date.now();

    const room = memoryStore.getRoomByPlayerSession(sessionToken);
    if (!room) return undefined;

    // Cancel grace timers
    if (room.graceTimer) {
      clearTimeout(room.graceTimer);
      room.graceTimer = null;
    }
    if (room.graceTicker) {
      clearInterval(room.graceTicker);
      room.graceTicker = null;
    }
    room.graceRemainingSeconds = undefined;
    memoryStore.disconnectedSessions.delete(sessionToken);

    room.connectionStates[sessionToken] = 'connected';

    // Notify opponent
    const opponentSession = room.playerSessionIds.find((id) => id !== sessionToken);
    if (opponentSession && this.io) {
      const oppPlayer = memoryStore.players.get(opponentSession);
      if (oppPlayer?.isOnline) {
        this.io.to(oppPlayer.socketId).emit('player:opponent_reconnected', {
          opponentName: player.profile.displayName,
        });
      }
    }

    this.broadcastRoomState(room);
    this.broadcastGameState(room);

    return room;
  }

  public leaveRoom(sessionToken: string): void {
    const room = memoryStore.getRoomByPlayerSession(sessionToken);
    if (!room) return;

    const opponentSession = room.playerSessionIds.find((id) => id !== sessionToken);
    if (opponentSession && this.io) {
      const oppPlayer = memoryStore.players.get(opponentSession);
      if (oppPlayer?.isOnline) {
        this.io.to(oppPlayer.socketId).emit('room:closed', {
          reason: 'Companion left the sanctuary.',
        });
      }
    }

    const p1 = memoryStore.players.get(room.playerSessionIds[0]);
    const p2 = memoryStore.players.get(room.playerSessionIds[1]);
    if (p1) p1.currentRoomId = undefined;
    if (p2) p2.currentRoomId = undefined;

    memoryStore.rooms.delete(room.roomId);
  }

  public broadcastRoomState(room: ServerRoom): void {
    if (!this.io) return;
    for (const sessionId of room.playerSessionIds) {
      const player = memoryStore.players.get(sessionId);
      if (player?.isOnline) {
        const sanitized = this.getSanitizedRoomState(room, sessionId);
        this.io.to(player.socketId).emit('room:state', sanitized);
      }
    }
  }

  public broadcastGameState(room: ServerRoom): void {
    if (!this.io) return;
    const game = gameRegistry.get(room.gameId);
    if (!game) return;

    for (const sessionId of room.playerSessionIds) {
      const player = memoryStore.players.get(sessionId);
      if (player?.isOnline) {
        const sanitizedState = game.sanitizeState(room.gameState, sessionId);
        this.io.to(player.socketId).emit('game:state', {
          gameId: room.gameId,
          gameState: sanitizedState,
        });
      }
    }
  }

  /** Mind Meld — pushes the async AI vibe line + vector closeness for one revealed round. */
  public broadcastMindmeldVibe(room: ServerRoom, roundIndex: number, vibe: string, closeness?: number | null): void {
    if (!this.io) return;
    for (const sessionId of room.playerSessionIds) {
      const player = memoryStore.players.get(sessionId);
      if (player?.isOnline) {
        this.io.to(player.socketId).emit('game:mindmeld:vibe', { roundIndex, vibe, closeness: closeness ?? null });
      }
    }
  }

  private broadcastGameFinished(room: ServerRoom, completion: any): void {
    if (!this.io) return;
    const game = gameRegistry.get(room.gameId);
    if (!game) return;

    for (const sessionId of room.playerSessionIds) {
      const player = memoryStore.players.get(sessionId);
      if (player?.isOnline) {
        const sanitizedState = game.sanitizeState(room.gameState, sessionId);
        this.io.to(player.socketId).emit('game:finish', {
          winnerPlayerId: completion.winnerId,
          finishReason: completion.reason || 'Game completed',
          gameState: sanitizedState,
        });
      }
    }
  }
}

export const roomService = new RoomService();
