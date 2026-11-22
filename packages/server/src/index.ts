import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { gameRegistry } from './games/registry';
import { codingHangmanGame } from './games/hangman';
import { wouldYouRatherGame } from './games/wyr';
import { survivalAuctionGame } from './games/auction';
import { mindMeldGame } from './games/mindmeld';
import { hitTheMoleGame } from './games/mole';
import { mathDuelGame } from './games/math';
import { questionService } from './services/questionService';
import { scenarioService } from './services/scenarioService';
import { setupSocketHandlers } from './sockets/socketHandler';
import { memoryStore } from './storage/memoryStore';
import { ClientToServerEvents, ServerToClientEvents } from '@tether/shared';

// Register games
gameRegistry.register(codingHangmanGame);
gameRegistry.register(wouldYouRatherGame);
gameRegistry.register(survivalAuctionGame);
gameRegistry.register(mindMeldGame);
gameRegistry.register(hitTheMoleGame);
gameRegistry.register(mathDuelGame);

// Pre-fetch WYR questions (truthordarebot.xyz) & AI survival scenarios (OpenRouter)
questionService.start();
scenarioService.start();

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptimeSeconds: Math.floor(process.uptime()),
    stats: memoryStore.getStats(),
  });
});

// Server info endpoint
app.get('/info', (req, res) => {
  res.json({
    name: 'Tether Duo Game Server',
    version: '1.0.0',
    serverTime: Date.now(),
    pairingSecretRequired: Boolean(config.pairingSecret),
    supportedGames: gameRegistry.getAllSummaries(),
  });
});

// Serve the exported web client (packages/mobile/dist) from this process, so a
// single `bun run start` hosts the API and the playable web app together.
const webDistDir = path.resolve(__dirname, '../../mobile/dist');
const servesWebClient = fs.existsSync(path.join(webDistDir, 'index.html'));
if (servesWebClient) {
  app.use(express.static(webDistDir));
  // SPA fallback: non-API GETs resolve to the app shell (expo-router deep links)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(webDistDir, 'index.html'));
  });
}

const server = http.createServer(app);

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

setupSocketHandlers(io);

server.listen(config.port, config.host, () => {
  console.log(`[Server] Tether Duo Server running on http://${config.host}:${config.port}`);
  console.log(`[Server] Pairing Secret protection: ${config.pairingSecret ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[Server] Reconnection grace period: ${config.reconnectionGracePeriodMs / 1000}s`);
  console.log(
    `[Server] Web client: ${servesWebClient ? `serving ${webDistDir}` : 'not built — run "bun run build:web"'}`
  );
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[Server] ${signal} received. Closing gracefully...`);
  server.close(() => {
    console.log('[Server] Closed.');
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
