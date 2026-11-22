# Tether

A two-player, realtime companion game suite. Built for pairs — romantic partners, close friends, kin — who want small, warm games they can play together in two browser tabs, two phones, or across the room.

Two games ship today, with two more on the roadmap:

| Game | Status | How it plays |
|------|--------|--------------|
| **Guess My Answer** (`coding-hangman`) | ✅ Playable | Each player hides a secret word. Turn by turn you peek at your companion's word — a letter at a time, or through your own yes/no questions — until one of you guesses it whole. Opponent words are never sent to the other client until the match ends. |
| **Would You Rather?** (`syntax-duel`) | ✅ Playable | Five rounds of either-or questions, answered privately and revealed together. The result scores how in-sync your tastes are. Questions stream live from [truthordarebot.xyz](https://truthordarebot.xyz) with a built-in offline fallback pool. |
| Truth or Dare (`binary-whisper`) | 🚧 Planned | Registered in the catalog, coming soon. |
| Memory Lane (`memory-lane`) | 🚧 Planned | Registered in the catalog, coming soon. |

## Architecture

A Bun workspace monorepo with three packages:

```
packages/
├── shared/   Types + game config shared by both sides (socket contracts, state shapes, validators)
├── server/   Bun + Express + Socket.IO. Matchmaking, rooms, game engines, question pool, reconnection grace
└── mobile/   Expo (React Native) client. Runs as a web app AND as iOS/Android via Expo Go
```

- **One process serves everything.** The game server also serves the exported web client, so `bun run start` gives you the whole game at `http://localhost:3001` — API, WebSocket, and UI.
- **Authoritative server.** All game logic lives server-side; clients only render sanitized state (e.g. a rival's secret word and WYR pick are stripped server-side until reveal).
- **Reconnection grace.** Drop for up to 60s and your room survives; the other player sees a countdown banner instead of a dead lobby.

## Quick start

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun install          # install workspace dependencies
bun run build:web    # export the web client once
bun run start        # serve everything at http://localhost:3001
```

Open **two browser tabs** of `http://localhost:3001`, create a profile in each, pick a game, and both players will match each other. The client connects to the hosted server at `https://ushumusu.onrender.com` by default — for fully local play, build with `EXPO_PUBLIC_SERVER_URL=http://localhost:3001 bun run build:web`.

To play from phones on the same Wi-Fi, point the app's Settings → *Address* at your machine's LAN URL (e.g. `http://192.168.1.20:3001`) — both devices must enter the same pairing passphrase (default `tether-duo-secret`, override with `PAIRING_SECRET`).

### Environment

Copy `.env.example` to `.env` in the repo root to configure port, host, CORS origin, the pairing passphrase, reconnection grace, and turn timeout. Everything has a working default for local play.

## Development

```bash
bun run dev          # server with hot reload (:3001)
bun run mobile:web   # Expo web dev server with fast refresh (:8081) — it talks to :3001
bun run mobile:start # Expo Go dev server for iOS/Android
bun run test         # bun test across all packages
bun run typecheck    # tsc across all three packages
bun run smoke        # end-to-end two-player match over sockets (server must be running)
```

The Expo dev bundler on :8081 proxies nothing — the client defaults to the hosted server at `https://ushumusu.onrender.com`. Override it at build time with `EXPO_PUBLIC_SERVER_URL` (e.g. `http://localhost:3001` for local play) or per device via Settings → Address.

`appdesign/` holds the design system (`warm_companion_minimalism/DESIGN.md`) and HTML mockups for every screen the client implements.

## Deployment notes

- Build the web client (`bun run build:web`), set `CORS_ORIGIN` to your public URL and a strong `PAIRING_SECRET`, then run `bun run start` behind TLS.
- The server is stateless (in-memory rooms), so it scales to one instance per origin; restarts drop active rooms by design.
- The server needs outbound HTTPS to truthordarebot.xyz for live WYR questions; without it the game still runs on its local fallback pool.

## Roadmap

- Truth or Dare and Memory Lane game engines (the catalog and client routes already reserve them)
- Persistent profiles/stats (currently sessions and rooms live in memory)
- Native builds via EAS
