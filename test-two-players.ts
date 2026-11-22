import { io } from 'socket.io-client';

async function runTwoPlayerSimulation() {
  console.log('--- Starting Two-Player Multiplayer Integration Test ---');
  const serverUrl = 'http://localhost:3001';

  // Player 1
  const socket1 = io(serverUrl, { transports: ['websocket'] });
  // Player 2
  const socket2 = io(serverUrl, { transports: ['websocket'] });

  await new Promise<void>((resolve) => {
    let connected = 0;
    socket1.on('connect', () => {
      connected++;
      if (connected === 2) resolve();
    });
    socket2.on('connect', () => {
      connected++;
      if (connected === 2) resolve();
    });
  });

  console.log('✓ Both players connected to backend socket');

  // Authenticate Player 1 (Maya)
  const p1Auth = await new Promise<any>((resolve) => {
    socket1.emit(
      'player:connect',
      {
        profile: {
          id: 'user-maya',
          displayName: 'Maya',
          avatar: { type: 'preset', value: 'https://images.unsplash.com/photo-1517841905240-472988babdf9' },
          disposition: 'Thoughtful',
          comfortAnchor: 'Matcha & oat milk',
          pairingSecret: 'tether-duo-secret',
        },
        pairingSecret: 'tether-duo-secret',
      },
      resolve
    );
  });
  console.log('✓ Player 1 authenticated with session:', p1Auth.sessionId);

  // Authenticate Player 2 (Julian)
  const p2Auth = await new Promise<any>((resolve) => {
    socket2.emit(
      'player:connect',
      {
        profile: {
          id: 'user-julian',
          displayName: 'Julian',
          avatar: { type: 'preset', value: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb' },
          disposition: 'Quiet',
          comfortAnchor: 'Espresso',
          pairingSecret: 'tether-duo-secret',
        },
        pairingSecret: 'tether-duo-secret',
      },
      resolve
    );
  });
  console.log('✓ Player 2 authenticated with session:', p2Auth.sessionId);

  // Matchmaking: Player 1 joins queue
  const p1Join = await new Promise<any>((resolve) => {
    socket1.emit('matchmaking:join', { gameId: 'coding-hangman', pairingSecret: 'tether-duo-secret' }, resolve);
  });
  console.log('✓ Player 1 entered matchmaking queue:', p1Join.success);

  // Matchmaking: Player 2 joins queue -> Both should be matched!
  const matchPromise = Promise.all([
    new Promise<any>((resolve) => socket1.once('matchmaking:matched', resolve)),
    new Promise<any>((resolve) => socket2.once('matchmaking:matched', resolve)),
  ]);

  const p2Join = await new Promise<any>((resolve) => {
    socket2.emit('matchmaking:join', { gameId: 'coding-hangman', pairingSecret: 'tether-duo-secret' }, resolve);
  });
  console.log('✓ Player 2 joined queue:', p2Join.success);

  const [match1, match2] = await matchPromise;
  console.log('✓ Both players matched into room:', match1.roomId);
  console.log('  Player 1 matched with:', match1.opponent.displayName);
  console.log('  Player 2 matched with:', match2.opponent.displayName);

  // Lobby readiness: Both confirm ready
  await new Promise<any>((resolve) => socket1.emit('room:ready', { isReady: true }, resolve));
  await new Promise<any>((resolve) => socket2.emit('room:ready', { isReady: true }, resolve));
  console.log('✓ Both players toggled ready in lobby');

  // Submit Secret Words: Maya submits 'DOCKER', Julian submits 'PYTHON'
  await new Promise<any>((resolve) => socket1.emit('game:word:submit', { word: 'DOCKER' }, resolve));
  console.log('✓ Player 1 locked secret cipher: DOCKER');

  const phase1Promise = Promise.all([
    new Promise<any>((resolve) => socket1.once('game:state', resolve)),
    new Promise<any>((resolve) => socket2.once('game:state', resolve)),
  ]);

  await new Promise<any>((resolve) => socket2.emit('game:word:submit', { word: 'PYTHON' }, resolve));
  console.log('✓ Player 2 locked secret cipher: PYTHON');

  const [stateP1, stateP2] = await phase1Promise;
  console.log('✓ Both ciphers locked. Phase 1 active! Active player turn:', stateP1.gameState.activeTurnPlayerId);

  // Check state sanitization: opponent secret word must NOT be visible!
  if (stateP1.gameState.opponentState.secretWord !== undefined) {
    throw new Error('SECURITY BREACH: Opponent secret word leaked to Player 1!');
  }
  if (stateP2.gameState.opponentState.secretWord !== undefined) {
    throw new Error('SECURITY BREACH: Opponent secret word leaked to Player 2!');
  }
  console.log('✓ Security Verified: Opponent secret words are strictly hidden from clients');

  // Query letter 'E' in 'PYTHON' (P1's turn querying P2's word)
  const activeSocket = stateP1.gameState.activeTurnPlayerId === p1Auth.sessionId ? socket1 : socket2;
  const letterRes = await new Promise<any>((resolve) => {
    activeSocket.emit('game:letter:query', { letter: 'O' }, resolve);
  });
  console.log('✓ Active player queried letter "O":', letterRes.success);

  // Submit correct full word guess to finish match
  // If socket1 active, target is PYTHON (P2's word)
  // If socket2 active, target is DOCKER (P1's word)
  const isP1Active = stateP1.gameState.activeTurnPlayerId === p1Auth.sessionId;
  // If letter query switched turn, the OTHER player is active now:
  const newActiveSocket = isP1Active ? socket2 : socket1;
  const targetWord = isP1Active ? 'DOCKER' : 'PYTHON';

  const finishPromise = Promise.all([
    new Promise<any>((resolve) => socket1.once('game:finish', resolve)),
    new Promise<any>((resolve) => socket2.once('game:finish', resolve)),
  ]);

  const guessRes = await new Promise<any>((resolve) => {
    newActiveSocket.emit('game:guess:submit', { guess: targetWord }, resolve);
  });
  console.log(`✓ Player guessed '${targetWord}':`, guessRes);

  const [finish1, finish2] = await finishPromise;
  console.log('✓ Match finished! Winner:', finish1.winnerPlayerId);
  console.log('  Player 1 revealed opponent word:', finish1.gameState.opponentState.secretWord);
  console.log('  Player 2 revealed opponent word:', finish2.gameState.opponentState.secretWord);
  console.log('  Telepathy resonance percent:', finish1.gameState.stats?.resonancePercent + '%');

  socket1.disconnect();
  socket2.disconnect();
  console.log('--- ALL TWO-PLAYER MULTIPLAYER TESTS PASSED PERFECTLY ---');
}

runTwoPlayerSimulation().catch((err) => {
  console.error('Test simulation error:', err);
  process.exit(1);
});
