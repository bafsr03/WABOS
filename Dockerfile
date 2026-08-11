# Single image for the whole WABOS monorepo. The engine runs via tsx (no compile
# step); the two Next apps are built here and served with `next start`. The four
# runtime services (engine/store, whatsapp, dashboard, web) all run FROM this same
# image and differ only by their command + env — see docker-compose.yml.
FROM node:22-slim AS base

# better-sqlite3 and argon2 are native modules → need a toolchain to build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# ---- install deps (cached on lockfile) ----
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/engine/package.json ./apps/engine/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
# Dev deps are needed at build (tsx for the engine, typescript/next for the
# builds). NODE_ENV=production would skip them, so force them in with --prod=false.
RUN pnpm install --frozen-lockfile --prod=false

# ---- copy source ----
COPY . .

# NEXT_PUBLIC_* are inlined at build time. Google sign-in is optional for the MVP
# (email/password works without it); set this arg + rebuild to enable it. Leave
# NEXT_PUBLIC_ENGINE_URL empty so the browser calls /api same-origin (proxied).
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_ENGINE_URL=""
ARG NEXT_PUBLIC_CONTACT_URL=""
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_ENGINE_URL=$NEXT_PUBLIC_ENGINE_URL \
    NEXT_PUBLIC_CONTACT_URL=$NEXT_PUBLIC_CONTACT_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# ---- build the Next apps (engine needs no build) ----
RUN pnpm --filter @wabos/dashboard build && pnpm --filter @wabos/web build

EXPOSE 4000 3000 3001

# Default command = combined engine (ROLE=all). Compose overrides per service.
CMD ["pnpm", "--filter", "@wabos/engine", "start"]
