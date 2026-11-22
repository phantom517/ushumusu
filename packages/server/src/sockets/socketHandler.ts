import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ConnectPayload,
  ConnectAck,
  ReconnectPayload,
  ReconnectAck,
  MatchmakingJoinPayload,
} from '@tether/shared';
import { memoryStore } from '../storage/memoryStore';
import { roomService } from '../services/roomService';
import { matchmakingService } from '../services/matchmakingService';
import { closenessService } from '../services/closenessService';
import { chatService } from '../services/chatService';
import { v4 as uuidv4 } from 'uuid';

export function setupSocketHandlers(io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>) {
  roomService.setSocketServer(io);
  matchmakingService.setSocketServer(io);
  chatService.setSocketServer(io);

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Track session token attached to this socket
    let currentSessionToken: string | null = null;

    // 1. PLAYER CONNECT / INITIALIZE
    socket.on('player:connect', (payload: ConnectPayload, ack: (res: ConnectAck) => void) => {
      try {
        const { profile, sessionToken, pairingSecret } = payload;
        if (!profile || !profile.displayName) {
          return ack({
            success: false,
            sessionId: '',
            isReconnected: false,
            error: 'Profile with display name is required',
          });
        }

        // Check if player is reconnecting with an existing session token
        if (sessionToken && memoryStore.players.has(sessionToken)) {
          currentSessionToken = sessionToken;
          memoryStore.socketToSession.set(socket.id, sessionToken);

          const existingPlayer = memoryStore.players.get(sessionToken)!;
          existingPlayer.socketId = socket.id;
          existingPlayer.isOnline = true;
          existingPlayer.lastActiveAt = Date.now();
          existingPlayer.profile = {
            ...profile,
            pairingSecret: pairingSecret || profile.pairingSecret,
          };

          const restoredRoom = roomService.handlePlayerReconnect(sessionToken, socket.id);
          const sanitizedRoom = restoredRoom
            ? roomService.getSanitizedRoomState(restoredRoom, sessionToken)
            : undefined;

          chatService.broadcastPresence((existingPlayer.profile.pairingSecret || '').trim().toLowerCase() || 'default');

          console.log(`[Socket] Reconnected session: ${sessionToken} for ${profile.displayName}`);

          return ack({
            success: true,
            sessionId: sessionToken,
            isReconnected: true,
            activeRoom: sanitizedRoom,
          });
        }

        // New Session Creation
        const newSessionId = `sess-${uuidv4().substring(0, 12)}`;
        currentSessionToken = newSessionId;

        memoryStore.players.set(newSessionId, {
          sessionId: newSessionId,
          profile: {
            ...profile,
            pairingSecret: pairingSecret || profile.pairingSecret,
          },
          socketId: socket.id,
          connectedAt: Date.now(),
          lastActiveAt: Date.now(),
          isOnline: true,
        });

        memoryStore.socketToSession.set(socket.id, newSessionId);

        chatService.broadcastPresence((profile.pairingSecret || '').trim().toLowerCase() || 'default');

        console.log(`[Socket] New session registered: ${newSessionId} for ${profile.displayName}`);

        return ack({
          success: true,
          sessionId: newSessionId,
          isReconnected: false,
        });
      } catch (err: any) {
        console.error('[Socket] Error in player:connect', err);
        return ack({
          success: false,
          sessionId: '',
          isReconnected: false,
          error: err.message || 'Internal connection error',
        });
      }
    });

    // 2. PLAYER RECONNECT
    socket.on('player:reconnect', (payload: ReconnectPayload, ack: (res: ReconnectAck) => void) => {
      try {
        const { sessionToken } = payload;
        if (!sessionToken || !memoryStore.players.has(sessionToken)) {
          return ack({
            success: false,
            error: 'Session expired or not found. Please establish a new connection.',
          });
        }

        currentSessionToken = sessionToken;
        memoryStore.socketToSession.set(socket.id, sessionToken);

        const restoredRoom = roomService.handlePlayerReconnect(sessionToken, socket.id);
        const sanitizedRoom = restoredRoom
          ? roomService.getSanitizedRoomState(restoredRoom, sessionToken)
          : undefined;

        const reconnectPlayer = memoryStore.players.get(sessionToken);
        if (reconnectPlayer) {
          chatService.broadcastPresence((reconnectPlayer.profile.pairingSecret || '').trim().toLowerCase() || 'default');
        }

        console.log(`[Socket] Player explicitly reconnected: ${sessionToken}`);

        return ack({
          success: true,
          sessionId: sessionToken,
          activeRoom: sanitizedRoom,
        });
      } catch (err: any) {
        console.error('[Socket] Error in player:reconnect', err);
        return ack({
          success: false,
          error: err.message || 'Reconnection error',
        });
      }
    });

    // 3. LATENCY PING
    socket.on('player:ping', (timestamp: number, ack: (serverTime: number) => void) => {
      ack(Date.now());
    });

    // 4. MATCHMAKING JOIN
    socket.on('matchmaking:join', (payload: MatchmakingJoinPayload, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'Not authenticated with session' });
      }
      const res = matchmakingService.joinQueue(
        currentSessionToken,
        payload.gameId,
        payload.pairingSecret
      );
      ack({ success: res.success, error: res.error });
    });

    // 5. MATCHMAKING CANCEL
    socket.on('matchmaking:cancel', (ack) => {
      if (!currentSessionToken) {
        return ack({ success: false });
      }
      matchmakingService.cancelQueue(currentSessionToken);
      ack({ success: true });
    });

    // 6. LOBBY READY
    socket.on('room:ready', (data: { isReady: boolean }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const ok = roomService.setReady(room, currentSessionToken, data.isReady);
      ack({ success: ok });
    });

    // 7. LOBBY START
    socket.on('room:start', (ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      // Set caller ready and verify if ready
      roomService.setReady(room, currentSessionToken, true);
      ack({ success: true });
    });

    // 8. LOBBY LEAVE
    socket.on('room:leave', (ack) => {
      if (!currentSessionToken) {
        return ack({ success: false });
      }
      roomService.leaveRoom(currentSessionToken);
      ack({ success: true });
    });

    // 9. GAME: SUBMIT SECRET WORD
    socket.on('game:word:submit', (data: { word: string }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.handleGameAction(room, currentSessionToken, {
        type: 'submit_word',
        word: data.word,
      });
      ack(res);
    });

    // 10. GAME: LETTER QUERY
    socket.on('game:letter:query', (data: { letter: string }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.handleGameAction(room, currentSessionToken, {
        type: 'letter_query',
        letter: data.letter,
      });
      ack(res);
    });

    // 11. GAME: SUBMIT DEDUCTION QUESTION
    socket.on('game:question:submit', (data: { question: string }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.handleGameAction(room, currentSessionToken, {
        type: 'submit_question',
        question: data.question,
      });
      ack(res);
    });

    // 12. GAME: SUBMIT ANSWER TO QUESTION
    socket.on('game:answer:submit', (data: { questionId: string; answer: string }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.handleGameAction(room, currentSessionToken, {
        type: 'submit_answer',
        questionId: data.questionId,
        answer: data.answer,
      });
      ack(res);
    });

    // 13. GAME: SUBMIT COMPLETE WORD GUESS
    socket.on('game:guess:submit', (data: { guess: string }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.handleGameAction(room, currentSessionToken, {
        type: 'submit_guess',
        guess: data.guess,
      });
      ack(res);
    });

    // 14. GAME: REMATCH VOTE
    socket.on('game:rematch', (data: { vote: boolean }, ack) => {
      if (!currentSessionToken) {
        return ack({ success: false, error: 'No active session' });
      }
      const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
      if (!room) {
        return ack({ success: false, error: 'Room not found' });
      }
      const res = roomService.voteRematch(room, currentSessionToken, data.vote);
      ack({ success: true, rematchTriggered: res.rematchTriggered });
    });

    // 15. GAME (WYR): SUBMIT CHOICE
  socket.on('game:wyr:answer', (data: { choice: 'a' | 'b' }, ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'answer',
      choice: data.choice,
    });
    ack(res);
  });

  // 16. GAME (WYR): NEXT ROUND
  socket.on('game:wyr:next', (ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'next_round',
    });
    ack(res);
  });

  // 17. GAME (AUCTION): OPEN BID / RAISE
  socket.on('game:auction:bid', (data: { itemId: string; amount: number }, ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'bid',
      itemId: data.itemId,
      amount: data.amount,
    });
    ack(res);
  });

  // 18. GAME (AUCTION): FOLD — HIGH BIDDER TAKES THE LOT
  socket.on('game:auction:fold', (ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'fold',
    });
    ack(res);
  });

  // 19. GAME (AUCTION): NEXT ITEM
  socket.on('game:auction:next', (ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'next_item',
    });
    ack(res);
  });

  // 20. GAME (MIND MELD): SEAL A WORD
  socket.on('game:mindmeld:word', (data: { word: string }, ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'mind_word',
      word: data.word,
    });
    ack(res);

    // The submit that completes the round triggers the async AI vibe reading.
    // It arrives late via 'game:mindmeld:vibe'; the client ignores stale rounds.
    if (res.success) {
      const state: any = room.gameState;
      if (state?.gameId === 'parallel-minds' && state.phase === 'reveal') {
        const round = state.rounds[state.rounds.length - 1];
        const wordA = round?.words?.[state.playerIds[0]];
        const wordB = round?.words?.[state.playerIds[1]];
        if (wordA && wordB) {
          closenessService.getReading(room.roomId, round.index, wordA, wordB).then((reading) => {
            if (reading.vibe) {
              roomService.broadcastMindmeldVibe(room, round.index, reading.vibe, reading.closeness);
            }
          });
        }
      }
    }
  });

  // 21. GAME (MIND MELD): NEXT WORD
  socket.on('game:mindmeld:next', (ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'mind_next',
    });
    ack(res);
  });

  // 22. GAME (MOLE): SUBMIT SESSION SCORE
  socket.on('game:mole:submit', (data: { score: number; hits: number }, ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'mole_score',
      score: data.score,
      hits: data.hits,
    });
    ack(res);
  });

  // 23. GAME (MATH): ANSWER / SKIP THE CURRENT EQUATION
  socket.on('game:math:answer', (data: { index: number; answer: number | null }, ack) => {
    if (!currentSessionToken) {
      return ack({ success: false, error: 'No active session' });
    }
    const room = memoryStore.getRoomByPlayerSession(currentSessionToken);
    if (!room) {
      return ack({ success: false, error: 'Room not found' });
    }
    const res = roomService.handleGameAction(room, currentSessionToken, {
      type: 'math_answer',
      index: data.index,
      answer: data.answer,
    });
    ack(res);
  });

  // 19. DISCONNECT
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id}, reason: ${reason}`);
      memoryStore.socketToSession.delete(socket.id);

      if (currentSessionToken) {
        matchmakingService.handleDisconnect(currentSessionToken);

        const player = memoryStore.players.get(currentSessionToken);
        if (player) {
          const channel = (player.profile.pairingSecret || '').trim().toLowerCase() || 'default';
          player.isOnline = false;
          player.lastActiveAt = Date.now();
          roomService.handlePlayerDisconnect(currentSessionToken);
          chatService.broadcastPresence(channel);
        }
      }
    });

    // 20. CHAT: OPEN (history + partner presence + join line for the partner)
    socket.on('chat:open', (ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (!player) {
        return ack({ success: false, messages: [], partnerOnline: false, partnerName: null, partnerAvatar: null, error: 'No active session' });
      }
      const res = chatService.open(player);
      ack({ success: true, ...res });
    });

    // 21. CHAT: CLOSE (leave line for the partner)
    socket.on('chat:close', (ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (player) chatService.close(player);
      ack({ success: true });
    });

    // 22. CHAT: SEND
    socket.on('chat:send', (data, ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (!player) {
        return ack({ success: false, error: 'No active session' });
      }
      ack(chatService.sendText(player, data?.text ?? ''));
    });

    // 23. CHAT: TYPING INDICATOR (relayed to the partner only)
    socket.on('chat:typing', (data) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (player) chatService.typingToPartner(player, Boolean(data?.typing));
    });

    // 24. CHAT: PICK PROFILE PHOTO
    socket.on('chat:avatar', (data, ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (!player) {
        return ack({ success: false, error: 'No active session' });
      }
      ack(chatService.setAvatar(player, data?.avatarId ?? ''));
    });

    // 25. CHAT: INVITE YOUR PERSON TO A GAME
    socket.on('chat:invite', (data, ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (!player) {
        return ack({ success: false, error: 'No active session' });
      }
      ack(chatService.sendInvite(player, data?.gameId ?? ''));
    });

    // 26. CHAT: ANSWER A GAME INVITE
    socket.on('chat:invite:respond', (data, ack) => {
      const player = currentSessionToken ? memoryStore.players.get(currentSessionToken) : undefined;
      if (!player) {
        return ack({ success: false, error: 'No active session' });
      }
      ack(chatService.respondInvite(player, data?.inviteId ?? '', Boolean(data?.accept)));
    });
  });
}
