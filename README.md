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

## ⚠️ Disclaimer

WABOS uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web protocol library. WhatsApp may ban numbers that send spam. WABOS ships anti-ban guardrails (send jitter, hard broadcast throttling), but use it responsibly and test with a secondary number. See §11 of the manual.
