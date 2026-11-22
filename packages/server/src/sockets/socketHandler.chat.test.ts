import { describe, test, expect, afterAll } from 'bun:test';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from './socketHandler';
import { memoryStore } from '../storage/memoryStore';
import { chatService } from '../services/chatService';
import { CHAT_CONFIG, ConnectAck } from '@tether/shared';

/**
 * Live wiring test — the unit tests mock the io server, which once let a
 * missing chatService.setSocketServer() slip through: messages were stored
 * but NEVER broadcast, so senders only saw them after reopening the chat.
 * This boots a real server + two real clients and asserts live delivery.
 */

const SECRET = 'integration-duo';
const clients: ClientSocket[] = [];
const sessionIds: string[] = [];
let httpServer: ReturnType<typeof createServer> | null = null;

function waitUntil(fn: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  return (async () => {
    while (!fn()) {
      if (Date.now() - start > ms) throw new Error('condition not met in time');
      await new Promise((r) => setTimeout(r, 25));
    }
  })();
}

function connectClient(url: string, name: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client: ClientSocket = Client(url, { transports: ['websocket'] });
    clients.push(client);
    client.on('connect', () => {
      client.emit(
        'player:connect',
        {
          profile: {
            id: `profile-${name}`,
            displayName: name,
            avatar: { type: 'icon', value: 'avatar-sunny' },
            pairingSecret: SECRET,
          },
        },
        (ack: ConnectAck) => {
          if (ack.success) {
            sessionIds.push(ack.sessionId);
            resolve(client);
          } else {
            reject(new Error(ack.error));
          }
        }
      );
    });
    client.on('connect_error', (err) => reject(err));
  });
}

afterAll(() => {
  for (const c of clients) c.disconnect();
  httpServer?.close();
  // Leave the store as clean as we found it for the other test files
  for (const id of sessionIds) {
    memoryStore.players.delete(id);
    memoryStore.socketToSession.delete(id);
  }
  chatService.sweep(Date.now() + CHAT_CONFIG.TTL_MS * 2);
});

describe('chat live delivery (integration)', () => {
  test('sender AND partner both receive chat:message live', async () => {
    httpServer = createServer();
    const ioServer = new IOServer(httpServer, { cors: { origin: '*' } });
    setupSocketHandlers(ioServer as never);

    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve));
    const port = (httpServer!.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;

    const anna = await connectClient(url, 'anna');
    const noor = await connectClient(url, 'noor');

    const got: Array<{ who: string; text: string }> = [];
    anna.on('chat:message', ({ message }: { message: { text: string } }) => got.push({ who: 'anna', text: message.text }));
    noor.on('chat:message', ({ message }: { message: { text: string } }) => got.push({ who: 'noor', text: message.text }));

    const typingAt: string[] = [];
    noor.on('chat:typing', (data: { typing: boolean }) => {
      if (data.typing) typingAt.push('typing');
    });

    // Anna opens the chat (ack path) and sends a message (live path)
    const openAck = await new Promise<{ success: boolean; partnerOnline: boolean }>((resolve) =>
      anna.emit('chat:open', resolve as never)
    );
    expect(openAck.success).toBe(true);
    expect(openAck.partnerOnline).toBe(true);

    const sendAck = await new Promise<{ success: boolean }>((resolve) =>
      anna.emit('chat:send', { text: 'live hello' }, resolve as never)
    );
    expect(sendAck.success).toBe(true);

    await waitUntil(() => got.filter((g) => g.text === 'live hello').length === 2);
    expect(got.some((g) => g.who === 'anna' && g.text === 'live hello')).toBe(true);
    expect(got.some((g) => g.who === 'noor' && g.text === 'live hello')).toBe(true);

    // Typing reaches the partner live too
    anna.emit('chat:typing', { typing: true });
    await waitUntil(() => typingAt.length > 0);
  });
});
