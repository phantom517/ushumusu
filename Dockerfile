# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependencies: install only the server + shared workspace.
# The mobile workspace is intentionally absent so Expo/React Native packages
# never enter the image.
# ---------------------------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# bun.lock also lists the (absent) mobile workspace; Bun skips it with a note.
RUN bun install --frozen-lockfile --production

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bunfig.toml ./
COPY --chown=bun:bun packages/shared ./packages/shared
COPY --chown=bun:bun packages/server ./packages/server

USER bun
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "packages/server/src/index.ts"]
