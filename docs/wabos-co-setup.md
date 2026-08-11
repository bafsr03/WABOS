# wabos.co — go-live setup (Mac + tunnel now, VPS later)

This is the checklist to get `wabos.co` (landing) and `app.wabos.co`
(dashboard) live for the first time — starting on the owner's **Mac**
(free, no VPS yet) via a Cloudflare Tunnel, with a clean path to swap in a
**VPS** later without re-doing DNS from scratch. It's a companion to
**[`docs/deploy-vps.md`](./deploy-vps.md)** — that doc has the deep-dive on
Docker, backups, R2, and the split-backend switch; this one only covers
what's specific to wabos.co's two domains and the Mac↔VPS transition.

Estimated time: **30–45 minutes** for the Mac path today; **~15 minutes**
whenever you switch to the VPS later (DNS + `.env` edit only, no rebuild).

---

## What you're setting up

Two public hostnames, one Caddy, routed to whichever machine is currently
running the stack:

```
wabos.co        → Caddy → web:3001        (landing — apps/web)
app.wabos.co    → Caddy → dashboard:3000  (the dashboard)
                        → engine:4000     (/api/* and /ws, via Caddy)
```

**Today (Camino A):** Caddy runs in Docker on the owner's Mac; a **Cloudflare
Tunnel** exposes it to the internet with real HTTPS — no VPS, no open ports,
no public IP needed.

**Later (Camino B):** same Docker Compose stack, moved to a VPS; Caddy issues
its own HTTPS via Let's Encrypt directly. Switching is a DNS + two `.env`
lines, not a rebuild — see [§ Switching to the VPS later](#switch).

---

## Step 0 (once, unlocks both paths) — put wabos.co's DNS on Cloudflare

Cloudflare Tunnel needs to manage DNS for `wabos.co`, and it can't do that
while the domain's nameservers are GoDaddy's default ones — a CNAME to a
tunnel can't be set on GoDaddy at the **bare root domain** (`wabos.co`
itself, not just `app.wabos.co`), which is a general DNS limitation, not a
GoDaddy quirk. The fix is free and doesn't change your registrar:

1. Cloudflare dashboard → **Add a site** → enter `wabos.co` → pick the
   **Free** plan.
2. Cloudflare scans your existing GoDaddy DNS and shows a **"Review your DNS
   records"** screen. It'll likely include one or two **A records for `@`**
   pointing at some GoDaddy-owned IP (their default parked-domain page) —
   these aren't anything WABOS uses. **Delete those A records** on this
   screen (leave `TXT _dmarc`, `CNAME www`, and `CNAME _domainconnect` alone
   — harmless, unrelated to this setup), then **Continue to activation**.
   > Don't bother adding/editing A records directly in GoDaddy's own DNS
   > editor first — once you switch nameservers in the next step, GoDaddy's
   > per-record editor stops being what the internet actually reads, so any
   > record added there now is wasted effort. Clean up inside Cloudflare's
   > review screen instead.
3. Cloudflare shows you two **nameservers** (e.g. `xxx.ns.cloudflare.com`,
   `yyy.ns.cloudflare.com`). In **GoDaddy** → My Products → `wabos.co` →
   **DNS** → **Nameservers** → **Change** → **Enter my own nameservers** →
   paste the two Cloudflare ones (replacing GoDaddy's default
   `nsXX.domaincontrol.com` pair). GoDaddy stays your registrar (where you
   renew/pay); Cloudflare becomes where DNS records live.
4. Wait for Cloudflare to show the zone as **Active** (usually well under an
   hour, sometimes a few minutes). Check anytime with:
   ```bash
   dig +short NS wabos.co
   ```
   Once it prints the Cloudflare nameservers, you're set — do not proceed to
   Step A2 until this is active, or the tunnel DNS commands below will fail.

> This one-time move is also what makes switching to a VPS later painless:
> you'll just edit DNS **records** inside the same Cloudflare zone (CNAME →
> A) instead of touching nameservers again.

---

## Camino A — Right now: Mac + Cloudflare Tunnel

### A1. Make sure `cloudflared` is installed and logged in

```bash
brew install cloudflared
cloudflared tunnel login       # opens a browser, pick wabos.co's zone
```

### A2. Create (or reuse) a named tunnel

If you don't already have one for WABOS:

```bash
cloudflared tunnel create wabos
```

This prints a **tunnel ID** and writes credentials to
`~/.cloudflared/<tunnel-id>.json`. If you already have a `wabos` tunnel from
an earlier setup, reuse it — no need to create a second one.

### A3. Point both hostnames at the tunnel

```bash
cloudflared tunnel route dns wabos wabos.co
cloudflared tunnel route dns wabos app.wabos.co
```

Each command adds a CNAME record in Cloudflare pointing that hostname at
`<tunnel-id>.cfargotunnel.com`. Cloudflare terminates HTTPS for both — Caddy
on the Mac only ever sees plain HTTP.

### A4. Configure the tunnel to forward both hostnames to Caddy

Edit (or create) `~/.cloudflared/wabos-config.yml`:

```yaml
tunnel: wabos
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: wabos.co
    service: http://localhost:80
  - hostname: app.wabos.co
    service: http://localhost:80
  - service: http_status:404
```

Both hostnames forward to the **same** local port 80 — Caddy tells them
apart by the `Host` header (which cloudflared preserves) and routes to the
right container internally, same as it would on a VPS.

Run it as a background service so it survives reboots:

```bash
sudo cloudflared service install --config ~/.cloudflared/wabos-config.yml
```

(If you already have a `com.wabos.cloudflared` launchd agent from an earlier
setup, edit its config in place instead of installing a second service.)

### A5. `.env` — the one difference from the VPS path

```bash
cp .env.example .env
nano .env
```

```
APP_DOMAIN=http://app.wabos.co
MARKETING_DOMAIN=http://wabos.co
ALLOWED_ORIGIN=https://app.wabos.co
DASHBOARD_URL=https://app.wabos.co
NEXT_PUBLIC_APP_URL=https://app.wabos.co
```

> ⚠️ **The `http://` prefix on `APP_DOMAIN`/`MARKETING_DOMAIN` is the whole
> trick.** It tells Caddy "serve exactly this hostname over plain HTTP, no
> certificate" instead of its default "get me a real Let's Encrypt cert for
> this hostname" behavior — which would fail here since Cloudflare, not
> Caddy, owns the public TLS endpoint. Everything else (the `https://` URLs
> your users actually see, `NEXT_PUBLIC_APP_URL` for the landing page's CTA
> links) stays exactly like the VPS setup, because that's the real external
> address.

Fill in the rest of the secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, etc.)
per **[`docs/deploy-vps.md` §4](./deploy-vps.md#4-create-and-fill-the-env)**
— identical either way.

### A6. Launch

```bash
docker compose up -d --build
docker compose logs -f engine     # wait for "WABOS engine is running"
```

Make sure **Docker Desktop starts on login** (Settings → General) so the
stack comes back up automatically after a reboot — same caveat as before:
the Mac needs to stay awake and online, or WABOS goes offline and WhatsApp
can desync. Fine as a bridge; not real 24/7.

### A7. Verify

- [ ] `https://wabos.co` loads the landing page (padlock shows — that's
      Cloudflare's cert, not Caddy's).
- [ ] "Empezar gratis" links to `https://app.wabos.co/login`.
- [ ] `https://app.wabos.co` loads the dashboard login.
- [ ] `docker compose exec engine pnpm --filter @wabos/engine create-user`,
      then log in at `https://app.wabos.co`.

Continue with **[`docs/deploy-vps.md` §8 onward](./deploy-vps.md#8-link-whatsapp)**
for linking WhatsApp, the smoke test, R2, backups.

---

## Camino B — Later: VPS <a name="switch"></a>

When you're ready to move off the Mac, the DNS groundwork from Step 0
carries over — you're only changing **records**, not nameservers.

1. **Provision the VPS:** Hetzner Cloud → **CX23** (2 vCPU/4GB), Ubuntu
   24.04, region near your users. Add your SSH key, note the public IPv4.
2. **Switch DNS** in the Cloudflare dashboard (same zone from Step 0) —
   delete the two tunnel CNAME records, add two **A records** instead:
   | Type | Name | Value | Proxy status |
   |---|---|---|---|
   | A | `@` | `<VPS IP>` | **DNS only** (grey cloud) |
   | A | `app` | `<VPS IP>` | **DNS only** (grey cloud) |

   Set proxy status to **DNS only**, not proxied — Caddy needs to complete
   its own Let's Encrypt challenge and pass `/ws` through untouched, which
   Cloudflare's proxy would interfere with.
3. **Install Docker on the VPS** — follow
   [`docs/deploy-vps.md` §2](./deploy-vps.md#2-install-docker-on-the-vps).
4. **Get the code onto the server**, `.env`:
   ```
   APP_DOMAIN=app.wabos.co
   MARKETING_DOMAIN=wabos.co
   ```
   (drop the `http://` prefixes — everything else in `.env` stays
   identical, including `NEXT_PUBLIC_APP_URL`, so **no image rebuild is
   needed**, just the new `.env` on the new machine.)
5. `docker compose up -d --build` on the VPS. Watch `docker compose logs -f
   caddy` — it should obtain real certificates for both domains this time.
6. **Turn off the Mac tunnel** once the VPS is confirmed working:
   ```bash
   sudo launchctl unload /Library/LaunchDaemons/com.cloudflare.<tunnel-id>.plist
   # or: cloudflared service uninstall
   ```
   Stop the local `docker compose` stack on the Mac too (or leave it as a
   cold spare — your call).

From here, everything in `docs/deploy-vps.md` applies unmodified (backups,
R2, day-2 ops, the split-backend switch).

---

## Troubleshooting

- **Cloudflare zone stuck "Pending":** nameservers haven't propagated from
  GoDaddy yet. `dig +short NS wabos.co` should show Cloudflare's — if it
  still shows GoDaddy's after a few hours, double-check you saved the
  nameserver change in GoDaddy's DNS panel (not just DNS records).
- **`cloudflared tunnel route dns` fails "zone not found":** the zone isn't
  Active in Cloudflare yet — finish Step 0 first.
- **Landing/app load Cloudflare's default error page, not WABOS:** check
  `docker compose ps` (is Caddy up?) and that `ingress` in
  `wabos-config.yml` has both hostnames pointing at `http://localhost:80`.
- **Certificate warnings on the VPS after switching from the tunnel:**
  confirm the Cloudflare DNS records are **DNS only** (grey cloud), not
  proxied — a proxied orange-cloud record breaks Caddy's ACME challenge.
- **Landing page buttons point at `localhost:3000`:** `NEXT_PUBLIC_APP_URL`
  wasn't set before the build — set it and rebuild with `--build` (it's
  compiled into the JS either way, tunnel or VPS).
- **Everything else** (WhatsApp won't connect, image upload not configured,
  resetting the database): see
  **[`docs/deploy-vps.md` — Troubleshooting](./deploy-vps.md#troubleshooting)**.
