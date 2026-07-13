# WABOS — WhatsApp Business Operating System

> Turn your WhatsApp into your smartest employee.

WABOS V1 is a working end-to-end system: link a WhatsApp Business number via QR (Baileys), get every conversation in a realtime inbox, let an **AI Employee** (Claude) answer customers using your business profile + FAQs + catalog, manage contacts with tags and notes, and send throttled, tag-segmented broadcast campaigns.

📖 **Full manual: [docs/MANUAL.md](docs/MANUAL.md)** — setup, usage, deployment, troubleshooting, and the risks of unofficial WhatsApp APIs.

## Architecture

```
Customer ──▶ WhatsApp ──▶ Engine (Node, always-on)          Dashboard (Next.js)
                          ├─ Baileys WebSocket    ◀──REST+WS──┤  Inbox · CRM · Catalog
                          ├─ SQLite (data/)                    │  Broadcasts · Settings
                          └─ AI Employee (Claude + tools)      └  Connect (QR)
```

- `apps/engine` — Fastify + Baileys 6.7.23 + better-sqlite3 + `@anthropic-ai/sdk`. Holds the persistent WhatsApp connection (**cannot run on serverless**).
- `apps/dashboard` — Next.js 15 + Tailwind v4, talks to the engine with a bearer token.

## Quickstart

```bash
pnpm install
cp apps/engine/.env.example apps/engine/.env   # set DASHBOARD_TOKEN + ANTHROPIC_API_KEY
pnpm seed                                       # optional demo data
pnpm dev                                        # engine :4000 + dashboard :3000
```

Open http://localhost:3000, log in with your `DASHBOARD_TOKEN`, scan the QR from the business phone (WhatsApp → Linked Devices), and message the number from another phone — the AI replies within seconds.

Without `ANTHROPIC_API_KEY` everything still works except AI auto-replies (all chats behave as human-mode).

## ⚠️ Disclaimer

WABOS uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web protocol library. WhatsApp may ban numbers that send spam. WABOS ships anti-ban guardrails (send jitter, hard broadcast throttling), but use it responsibly and test with a secondary number. See §11 of the manual.
