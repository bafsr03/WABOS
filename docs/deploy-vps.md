# WABOS — Deploy to a VPS (step by step)

This is the full runbook to take WABOS live on a single Linux server with Docker.
It launches the **combined build** (`ROLE=all`) — one engine process running the
store API + WhatsApp + workers, plus the dashboard and marketing site, all behind
Caddy with automatic HTTPS. When you're ready you can switch to the **split
backends** (store + whatsapp as separate processes) with one command — see the
last section. Nothing about the split blocks going live today.

Estimated time: **30–45 minutes.**

> WABOS's real domains: **wabos.co** (marketing/landing, `apps/web`) and
> **app.wabos.co** (dashboard + API/WS, `apps/dashboard` + `apps/engine`). The
> `tudominio.com` examples below are generic placeholders — substitute
> `wabos.co` / `app.wabos.co` when following this runbook for the real deploy.

---

## Quick path: Hetzner + a subdomain you already own

This is the exact path used for the first launch. Follow it, then the numbered
sections below fill in the details.

1. **Server:** Hetzner Cloud → new **CX23** (2 vCPU / 4 GB), image **Ubuntu 24.04**,
   region closest to your users (Ashburn `ash` is lowest-latency for Perú). Add your
   SSH key. Note the public IPv4.
2. **Subdomain (no need to buy a domain):** on a domain you already control, add an
   **A record** `wabos` → `<Hetzner IP>` (e.g. `wabos.tudominio.com`). Caddy then
   issues real HTTPS for it automatically — needed for the PWA (push, install,
   Google sign-in).
   > ⚠️ **If that domain is on Cloudflare**, set this record to **DNS only (grey
   > cloud), not proxied** — so Caddy can complete the Let's Encrypt challenge and
   > the `/ws` WebSocket passes through cleanly.
3. Continue with **§2 (install Docker)** onward, using `APP_DOMAIN=wabos.tudominio.com`.

**Later, when you get the dedicated domain:** add its A record, change `APP_DOMAIN`,
`ALLOWED_ORIGIN` and `DASHBOARD_URL` in `.env`, and `docker compose up -d`. Caddy
issues the new certificate on the first visit — no rebuild.

---

## 0. What you need

- A **VPS** (2 vCPU / 2–4 GB RAM is plenty to start) running Ubuntu 22.04+ —
  e.g. Hetzner, DigitalOcean, Vultr. You need `root`/`sudo` SSH access.
- A **domain** you control (e.g. `app.tudominio.com`) so Caddy can issue HTTPS.
  Not strictly required for a first test (you can use plain HTTP on the IP), but
  strongly recommended.
- An **Anthropic API key** for the AI Employee (optional — without it the app
  still runs, conversations just stay in manual/human mode).
- A **Cloudflare R2** bucket for product photos (optional — the catalog and CSV
  import/export work without it; only photo upload needs it). See §6.

> ⚠️ **Rotate secrets first.** The repo's local `apps/engine/.env` has contained
> real keys during development (Anthropic, Lemon Squeezy). **Before going live,
> regenerate those keys** in each provider's dashboard and only put the new ones
> in the server's `.env`. Never reuse a key that has sat in a working tree.

---

## 1. Point DNS at the server

In your DNS provider, create an **A record**:

```
app.tudominio.com   →   <your VPS public IP>
```

(If you'll also serve the marketing site, add another A record for it.)
DNS can take a few minutes to propagate.

---

## 2. Install Docker on the VPS

SSH in, then:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # let your user run docker without sudo
# log out and back in so the group takes effect
```

Verify: `docker version` and `docker compose version` both print output.

---

## 3. Get the code onto the server

```bash
git clone <your-repo-url> wabos
cd wabos
```

(Or `scp`/`rsync` the project up if the repo isn't hosted anywhere.)

---

## 4. Create and fill the `.env`

```bash
cp .env.example .env
nano .env
```

Fill in **at minimum**:

| Variable | What to put |
|---|---|
| `APP_DOMAIN` | `app.tudominio.com` (or `:80` for a quick HTTP-only IP test) |
| `ALLOWED_ORIGIN` | `https://app.tudominio.com` |
| `DASHBOARD_URL` | `https://app.tudominio.com` |
| `POSTGRES_PASSWORD` | a strong random password |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `DASHBOARD_TOKEN` | `openssl rand -hex 24` |
| `STORE_INTERNAL_KEY` | `openssl rand -hex 24` |
| `WA_INTERNAL_KEY` | `openssl rand -hex 24` |
| `ANTHROPIC_API_KEY` | your (freshly rotated) key, or leave blank |

Handy one-liner to generate a secret: `openssl rand -hex 32`.

Everything else (billing, SMTP, push, R2) is optional — leave blank to disable.

---

## 5. Launch

```bash
docker compose up -d --build
```

First build takes a few minutes (it installs deps and builds the two Next apps).
Then check everything is healthy:

```bash
docker compose ps
docker compose logs -f engine     # watch the engine boot; Ctrl-C to stop tailing
```

You should see the engine run migrations and print `WABOS engine is running`.
Caddy will obtain the HTTPS certificate automatically the first time you visit
the domain.

---

## 6. (Optional) Cloudflare R2 for product photos

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `wabos-media`).
2. **Settings → Public access**: enable it (gives a `https://pub-xxxx.r2.dev`
   URL), or attach a custom domain like `img.tudominio.com`.
3. **Manage R2 API Tokens → Create** an Object-Read-&-Write token. Note the
   **Access Key ID**, **Secret Access Key**, and your **Account ID**.
4. Put them in `.env`:
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=wabos-media
   R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
   ```
5. `docker compose up -d` again to apply. Product photo upload now works in the
   catalog editor.

---

## 7. Create the first user

```bash
docker compose exec engine pnpm --filter @wabos/engine create-user
```

Follow the prompts (email, password, business name). This is the account your
brother logs in with at `https://app.tudominio.com`.

---

## 8. Link WhatsApp

1. Open `https://app.tudominio.com`, log in.
2. Go to **Conexión** — a QR code appears.
3. On the phone: WhatsApp → **Linked devices → Link a device** → scan the QR.
4. The status flips to **connected**. The session is saved to a Docker volume,
   so it survives restarts and redeploys.

---

## 9. Smoke test (do these once, in order)

- [ ] Log in at the domain over **HTTPS** (padlock shows).
- [ ] **Conexión** shows *connected* after scanning.
- [ ] Send a WhatsApp message to the linked number from another phone → it
      appears in the **Inbox**; reply from the inbox → it arrives on the phone.
- [ ] **Catálogo → Descargar plantilla** → fill 2–3 rows in Excel/Sheets →
      **Importar CSV** → products appear (check the created/updated toast).
- [ ] **Catálogo → Exportar** → the CSV downloads and matches your catalog.
- [ ] (If R2 set) open a product → **Agregar foto** → the image shows in the list.
- [ ] **Registro** (POS): ring up a sale → it shows in **Ventas**.

If all boxes pass, you're live. 🎉

---

## 10. Inventory import/export — how it works (for the owner)

- **Descargar plantilla** gives a CSV with the right columns and one example row:
  `sku, name, description, category, price, cost, currency, stock, track_stock, active`.
- Fill it in a spreadsheet and **Importar CSV**. Rows are matched by **SKU**: a
  matching SKU updates that product, anything else is added. `name` and `price`
  are required; bad rows are reported and skipped (the rest still import).
- **Exportar** downloads your current catalog in the same shape, so you can edit
  it and re-import round-trip.

---

## 11. Day-2 operations

**Update to a new version:**
```bash
git pull
docker compose up -d --build
```
Migrations run automatically on engine start.

**Backups (recommended):** set `BACKUP_DIR=/app/apps/engine/data/backups` in
`.env` and redeploy — a daily JSON snapshot of all data is written to the mounted
`wa_data` volume. Also back up Postgres itself:
```bash
docker compose exec postgres pg_dump -U wabos wabos > wabos-$(date +%F).sql
```

**Logs:** `docker compose logs -f engine` (or `dashboard`, `caddy`).

**Restart everything:** `docker compose restart`.

---

## 12. (Later) Switch to the split backends

When you want the store and WhatsApp to run as separate processes — so restarting
one never touches the other — stop the combined stack and bring up the split one
(it uses the **same image and the same `.env`**):

```bash
docker compose down
docker compose -f docker-compose.split.yml up -d --build
```

This starts `store` (ROLE=store) and `whatsapp` (ROLE=whatsapp) instead of the
single `engine`. They share the same Postgres and WhatsApp session volume, so no
data is lost and the WhatsApp link stays intact. To go back, `docker compose -f
docker-compose.split.yml down` then `docker compose up -d`.

Verify after switching: send a WhatsApp message in (should reach the Inbox → the
event bridge works), reply from the inbox (should send → the internal channel
works), and `docker compose -f docker-compose.split.yml restart whatsapp` — the
dashboard/API stay up the whole time.

---

## Troubleshooting

- **No HTTPS / cert error:** make sure DNS points at the server and ports 80+443
  are open in the VPS firewall. Check `docker compose logs caddy`.
- **Dashboard loads but API calls fail:** check `docker compose logs engine`. The
  dashboard reaches the engine over the internal network (`ENGINE_ORIGIN`), so
  the engine container must be healthy.
- **WhatsApp won't connect:** re-open **Conexión** for a fresh QR. If it loops,
  `docker compose restart engine` and try again.
- **Image upload says "not configured":** the R2 vars in §6 aren't all set.
- **Reset the database (destroys all data):** `docker compose down -v` removes the
  volumes — only do this intentionally.
