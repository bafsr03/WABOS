# WABOS — Manual de Usuario / User Manual

> **Your Business. Powered by WhatsApp.**
>
> WABOS convierte el WhatsApp de tu negocio en tu empleado más inteligente: responde al instante con IA, organiza a tus clientes, maneja tu catálogo y envía campañas — sin que cambies la forma en que ya trabajas.

This manual covers everything in WABOS V1: installation, connecting your WhatsApp, the Inbox, the AI Employee, the CRM, the Catalog, Broadcasts, deployment, and troubleshooting.

> **📚 Also available as a shareable HTML documentation suite.** Open `docs/index.html` in any browser for the full set of role-based manuals:
> - **[User Manual](user-manual.html)** — this document, as a styled web page
> - **[Owner Manual](owner-manual.html)** — operating WABOS as a service (business model, onboarding, ban-risk fleet management, metrics)
> - **[Developer Manual](developer-manual.html)** — architecture, data model, API reference, extending the system
> - **[Salesman Manual](salesman-manual.html)** — positioning, plans, the STAND 120 demo script, objection handling
> - **[Pricing & Limitations](pricing.html)** — established plan limits, cost structure, and margins
> - **[v2 Roadmap](v2-roadmap.html)** — what to build next and how to build it properly

---

## 1. What WABOS V1 includes

| Module | What it does |
|---|---|
| **Conexión** | Links your business WhatsApp number by scanning a QR code |
| **Inbox** | Every customer conversation in one place, in realtime |
| **Empleado IA** | Claude-powered auto-replies trained on your business profile, FAQs and catalog |
| **Contactos (CRM)** | Customers, tags and notes |
| **Catálogo** | Products with prices the AI uses to answer and recommend |
| **Campañas** | Tag-segmented broadcasts with anti-ban throttling |
| **Ajustes** | Business profile, AI tone and instructions, FAQs, AI kill-switch |

WABOS has two parts:

- **Engine** (`apps/engine`) — a long-running Node.js server that keeps the WhatsApp connection alive, stores everything in SQLite, and runs the AI. *It must stay running 24/7 for WABOS to work.*
- **Dashboard** (`apps/dashboard`) — the web app you use every day, at `http://localhost:3000`.

---

## 2. Installation & first run

**Requirements:** Node.js ≥ 20 (22 recommended), pnpm ≥ 9, and a WhatsApp number for the business (a *secondary/test number* is strongly recommended while you evaluate — see §11).

```bash
# 1. Install dependencies
pnpm install

# 2. Configure the engine
cp apps/engine/.env.example apps/engine/.env
# Edit apps/engine/.env:
#   DASHBOARD_TOKEN  → any secret you choose (this is your dashboard password)
#   ANTHROPIC_API_KEY → your Claude API key (get one at console.anthropic.com)
#                       Without it, the AI Employee is disabled and every chat
#                       needs a human reply.

# 3. (Optional) load demo data — a fictional Lima store with products & FAQs
pnpm seed

# 4. Start everything (engine on :4000, dashboard on :3000)
pnpm dev
```

Open **http://localhost:3000**, enter your `DASHBOARD_TOKEN`, and you're in.

> **Tip:** run `pnpm dev:engine` and `pnpm dev:dashboard` in separate terminals if you prefer separate logs.

---

## 3. Connecting your WhatsApp

1. Go to **Conexión** in the dashboard (the QR also prints in the engine terminal).
2. On the business phone: **WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo**.
3. Scan the QR. Within seconds the status dot turns green: **connected**.

Notes:

- WABOS uses WhatsApp's multi-device mode: **your phone does not need to stay online** after linking, but it must connect to the internet at least once every ~14 days.
- The session is stored in `apps/engine/auth/`. Restarting the engine does **not** require re-scanning. Deleting that folder does.
- **Desvincular número** logs out and clears the session; a fresh QR appears immediately.
- If you unlink from the phone instead, WABOS detects it, clears the dead session and shows a new QR automatically.

---

## 4. Inbox

The Inbox shows every 1-on-1 conversation (groups, channels and statuses are intentionally ignored).

- **Left pane** — conversations sorted by recency, with unread badges and a mode chip: `IA` (green) or `Humano` (gray).
- **Right pane** — the message thread. AI replies are marked with 🤖.

**AI vs Human mode — the handoff rules:**

| Action | Effect |
|---|---|
| Customer writes, conversation in `IA` mode | AI answers automatically (after a ~4 s pause to batch rapid messages) |
| You type any manual reply | Conversation flips to `Humano` — the AI steps aside |
| You press the mode button | Toggles between `IA` and `Humano` at any time |
| The AI decides it can't help (angry customer, complaint, asks for a person) | It hands off to `Humano` by itself and tells the customer someone will follow up |

Messages you send from the business phone itself also appear in the Inbox (and never trigger the AI).

---

## 5. The AI Employee

The AI Employee is powered by Claude and only knows what you teach it. It will refuse to invent prices or stock — feed it well:

1. **Ajustes → Perfil del negocio**: name, description (what you sell, where you are, delivery, payment methods), business hours, tone, and any extra instructions ("siempre ofrece el delivery", "no des descuentos").
2. **Ajustes → Preguntas frecuentes**: the AI treats these as ground truth. Add your top 10 questions.
3. **Catálogo**: the AI sees product names and prices, and can search descriptions to answer "¿tienen polos en talla M?".

The AI can also, on its own:
- **Search the catalog** for details before answering,
- **Tag customers** (e.g. `interesado`) when it detects buying intent — check Contactos to see who's hot,
- **Hand off to a human** when it's out of its depth.

**Kill switch:** Ajustes → Empleado IA toggle turns all AI replies off globally, instantly. Per-conversation control is the Inbox mode button.

**Costs:** each AI reply is one Claude API call. With `claude-sonnet-5` a typical WhatsApp reply costs a fraction of a cent; hundreds of conversations a month cost a few dollars.

---

## 6. Contactos (CRM)

- Contacts are **created automatically** whenever someone writes to you.
- Add contacts manually with phone in international format without `+` (Peru: `51987654321`).
- **Etiquetas (tags)**: click `+ etiqueta` to tag (e.g. `vip`, `mayorista`, `interesado`). Click a tag to remove it. Tags drive broadcast segments.
- **Notas**: free-form notes per customer ("prefiere delivery por las tardes").
- Deleting a contact deletes its whole conversation history. There is no undo.

---

## 7. Catálogo

Add products with name, description and price (PEN by default). Good descriptions make the AI dramatically better — include sizes, colors, materials, variants.

- **Desactivar** hides a product from the AI without deleting it (out of stock).
- Prices are always answered from here; the AI never makes them up.

---

## 8. Campañas (Broadcasts)

1. Name the campaign, pick a segment (**all contacts** or **one tag**), write the message.
2. WABOS shows the recipient count, asks for confirmation, then sends **one message every 6–12 seconds** (randomized). This throttling is deliberate — see §11 — and cannot be disabled.
3. Watch live progress (sent / failed) on the same page.

**Best practices that keep your number alive:**
- Only message people who have written to you before or gave you their number.
- Keep segments small and relevant (that's what tags are for).
- Space campaigns out; don't send to your whole base daily.
- Personalize: short, useful, human-sounding messages get fewer "block" taps — and blocks are what get numbers banned.

---

## 9. Deployment to a server (VPS)

Any small VPS (1 GB RAM) runs WABOS. Example with Ubuntu + pm2:

```bash
# On the server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
npm i -g pnpm pm2

git clone <your-repo> wabos && cd wabos
pnpm install
cp apps/engine/.env.example apps/engine/.env && nano apps/engine/.env   # set token + API key

# Engine (must run 24/7)
pm2 start "pnpm --filter @wabos/engine start" --name wabos-engine

# Dashboard
cd apps/dashboard && NEXT_PUBLIC_ENGINE_URL=https://engine.yourdomain.com pnpm build && cd ../..
pm2 start "pnpm --filter @wabos/dashboard start" --name wabos-dashboard

pm2 save && pm2 startup   # survive reboots
```

Put nginx/Caddy with HTTPS in front of both ports (engine `:4000`, dashboard `:3000`). The dashboard needs `NEXT_PUBLIC_ENGINE_URL` **at build time** pointing to the engine's public URL (it must also proxy the `/ws` WebSocket path).

First QR scan on a server: open the dashboard's Conexión page, or `pm2 logs wabos-engine` — the QR prints in the log.

**Backups:** copy `apps/engine/data/` (all business data) and `apps/engine/auth/` (the WhatsApp session) regularly.

---

## 10. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Dashboard says "No se pudo conectar con el motor" | The engine isn't running or `NEXT_PUBLIC_ENGINE_URL` is wrong. Start the engine first. |
| "Token inválido" at login | Token doesn't match `DASHBOARD_TOKEN` in `apps/engine/.env`. Restart the engine after changing it. |
| QR never turns into "connected" | QRs rotate every ~30 s — scan quickly. Check the phone has internet. Try Desvincular to force a fresh QR. |
| Status flips to `disconnected` and back | Normal — WhatsApp drops idle sockets; WABOS reconnects with backoff automatically. |
| Engine logs "session logged out" | The number was unlinked from the phone (or banned). WABOS clears the session and shows a new QR. |
| AI doesn't reply | Check, in order: `ANTHROPIC_API_KEY` set in `.env`? Ajustes → Empleado IA toggle on? Conversation in `IA` mode (a manual reply flips it to `Humano`)? |
| AI replies wrong things | It only knows your Perfil, FAQs and Catálogo — improve them. Add corrections as "Instrucciones extra". |
| Broadcast stuck in "Enviando…" | That's the 6–12 s per-recipient throttle. 100 recipients ≈ 10–20 minutes. If the engine restarts mid-campaign, unsent recipients stay `pending` (re-create the campaign for them). |
| `better-sqlite3` build error on install | Install build tools: macOS `xcode-select --install`; Ubuntu `sudo apt install build-essential python3`. |

---

## 11. ⚠️ Important: risks you must understand

WABOS connects through **Baileys**, an open-source library that speaks the WhatsApp Web protocol. It is **not an official WhatsApp API**.

- **WhatsApp can ban numbers** that behave like spammers — mass unsolicited messages, high block rates, brand-new numbers blasting broadcasts. Bans can be permanent.
- WABOS ships with guardrails (humanized typing delays, randomized send spacing, hard broadcast throttling, groups ignored), but **no guardrail makes abuse safe**. Message people who expect to hear from you.
- **Recommendations:** test with a secondary number first; "warm up" new numbers with weeks of normal 1-on-1 use before broadcasting; keep campaigns small, segmented and genuinely useful.
- A WhatsApp protocol change can temporarily break connectivity until the Baileys library updates. Pin versions (WABOS pins `6.7.23`) and test before upgrading.
- For businesses at a scale where a ban is existential, the official **WhatsApp Business Platform (Cloud API)** is the sanctioned alternative — with per-message costs and template approval. WABOS's architecture isolates the WhatsApp layer in `apps/engine/src/wa/`, so a future Cloud API adapter can replace Baileys without touching the rest.

---

## 12. Quick reference

| Thing | Where |
|---|---|
| Dashboard | http://localhost:3000 |
| Engine API | http://localhost:4000 (Bearer `DASHBOARD_TOKEN`) |
| Engine config | `apps/engine/.env` |
| Business data (SQLite) | `apps/engine/data/wabos.db` |
| WhatsApp session | `apps/engine/auth/` |
| Demo data | `pnpm seed` |
| Logs | engine terminal / `pm2 logs wabos-engine` |
