# WABOS — WhatsApp Business Operating System

> Turn your WhatsApp into your smartest employee.

WABOS is a **multi-tenant** WhatsApp Business platform: users register an account, link a WhatsApp Business number via QR (Baileys), get every conversation in a realtime inbox, and let purpose-built **AI agents** (Claude) answer customers using the business profile, FAQs, catalog, and a structured knowledge base — plus CRM, throttled tag-segmented broadcasts, and a payment-verification pipeline.

📖 **Full manual: [docs/MANUAL.md](docs/MANUAL.md)** · **v2 build status & roadmap: [docs/v2-roadmap.html](docs/v2-roadmap.html)**

## Architecture

```
Customer ──▶ WhatsApp ──▶ Engine (Node, always-on)              Dashboard (Next.js)
                          ├─ Connection manager: Map<biz→socket> ◀─REST+WS─┤ Inbox · CRM · Catalog
                          ├─ Postgres (business_id-scoped)                  │ Agents · Knowledge
                          └─ AI agents (Claude + tools)                     └ Connect (per-tenant QR)
```

- `apps/engine` — Fastify + Baileys 6.7.23 + **Postgres (`pg`)** + `@anthropic-ai/sdk`. Holds the persistent per-business WhatsApp sockets (**cannot run on serverless**). Every table is scoped by `business_id`; auth is built-in email/password + JWT (Google sign-in optional).
- `apps/dashboard` — Next.js 15 + Tailwind v4, talks to the engine with the user's JWT.

## Quickstart

```bash
pnpm install
cp apps/engine/.env.example apps/engine/.env   # set JWT_SECRET + ANTHROPIC_API_KEY (+ DATABASE_URL for prod)
pnpm --filter engine pg:dev                     # embedded Postgres on :5433 (no Docker needed) — keep running
pnpm --filter engine seed                       # optional demo data
pnpm dev                                        # engine :4000 + dashboard :3000
```

Open http://localhost:3000 → **Regístrate** (create an account + workspace) → scan the QR from the business phone (WhatsApp → Linked Devices) → message the number from another phone; the AI replies within seconds. Multiple accounts each get isolated data and their own number.

Without `ANTHROPIC_API_KEY` everything still works except AI auto-replies (all chats behave as human-mode).

## Running locally, step by step

The `pnpm dev` shortcut above starts the engine and dashboard together. If you're new to the project, it's clearer to run each service in **its own terminal tab** so you can read its logs and restart just the piece you changed. Start them **in this order** — each depends on the one before it.

> **New to terminals?** Open a new tab with `Cmd-T` (macOS). Run one command per tab and leave it running — don't close the tab. Stop a running service with `Ctrl-C`.

**Terminal 1 — Database (Postgres).** Must start first; the engine can't boot without it. Keep it running.
```bash
cd ~/Desktop/WABOS/apps/engine && pnpm pg:dev
```
Wait until it reports it's listening on port **5433**.

**Terminal 2 — Engine (the backend API).** Reads `apps/engine/.env` at startup, so restart this tab whenever you change that file (API keys, billing config, etc.).
```bash
cd ~/Desktop/WABOS/apps/engine && pnpm dev
```
Wait for `API listening on http://localhost:4000`.

**Terminal 3 — Dashboard (the web app).** Reads `apps/dashboard/.env.local` at startup, so restart this tab whenever you change that file (e.g. `NEXT_PUBLIC_ENGINE_URL`).
```bash
cd ~/Desktop/WABOS/apps/dashboard && pnpm dev
```
Wait for `Ready` on http://localhost:3000, then open that URL in your browser.

**Terminal 4 — Cloudflare tunnel *(only needed to test billing webhooks locally)*.** Lemon Squeezy must reach your engine from the internet to deliver subscription webhooks; this exposes `localhost:4000` behind a public HTTPS URL.
```bash
cloudflared tunnel --url http://localhost:4000
```
It prints a URL like `https://<random-words>.trycloudflare.com`. Use `https://<random-words>.trycloudflare.com/api/webhooks/billing` as the Callback URL in **Lemon Squeezy → Settings → Webhooks**.

> ⚠️ **The tunnel URL changes every time you restart it.** Leave this tab running for the whole session. If you do restart it, update the webhook's Callback URL in Lemon Squeezy to the new address (no `.env` change is needed — only the webhook **signing secret** lives in `.env`).

**What needs a restart when you edit config:**

| You edited… | Restart |
|---|---|
| `apps/engine/.env` | Terminal 2 (engine) |
| `apps/dashboard/.env.local` | Terminal 3 (dashboard) |
| Restarted the Cloudflare tunnel | Update the Lemon Squeezy webhook URL |

**Ports at a glance:** Postgres `5433` · Engine `4000` · Dashboard `3000`. If a service says a port is already in use, a previous run is still open — free them with:
```bash
lsof -ti :4000 -ti :3000 | xargs kill -9 2>/dev/null   # leaves Postgres + the tunnel alone
```

## ⚠️ Disclaimer

WABOS uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web protocol library. WhatsApp may ban numbers that send spam. WABOS ships anti-ban guardrails (send jitter, hard broadcast throttling), but use it responsibly and test with a secondary number. See §11 of the manual.
