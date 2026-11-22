import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  pairingSecret: process.env.PAIRING_SECRET || 'tether-duo-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  reconnectionGracePeriodMs: parseInt(process.env.RECONNECTION_GRACE_PERIOD_MS || '60000', 10),
  turnTimeoutSeconds: parseInt(process.env.TURN_TIMEOUT_SECONDS || '45', 10),
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
};
