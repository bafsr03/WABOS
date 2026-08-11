import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tests point WABOS_DATA_DIR at a throwaway dir so each suite gets an isolated
// SQLite file/media dir; production leaves it unset and uses the package's data/.
const dataDir = process.env.WABOS_DATA_DIR
  ? path.resolve(process.env.WABOS_DATA_DIR)
  : path.join(rootDir, 'data');

// Which subsystems this process runs. 'all' = the classic combined monolith
// (store API + WhatsApp + every worker in one process — the default, and what we
// ship first). 'store' = dashboard API/WS + store-side workers only. 'whatsapp' =
// Baileys sockets + WhatsApp-side workers only. The two split roles share one
// Postgres and talk over the internal keyed channel below.
const rawRole = (process.env.ROLE ?? 'all').toLowerCase();
const role = (['all', 'store', 'whatsapp'].includes(rawRole) ? rawRole : 'all') as 'all' | 'store' | 'whatsapp';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  role,
  // Mutual service-to-service keys ("keys from both sides"). store→whatsapp calls
  // carry STORE_INTERNAL_KEY; whatsapp→store callbacks carry WA_INTERNAL_KEY. Each
  // side verifies the peer's key on its /internal/* routes. Never exposed publicly.
  storeInternalKey: process.env.STORE_INTERNAL_KEY ?? 'wabos-dev-internal-store',
  waInternalKey: process.env.WA_INTERNAL_KEY ?? 'wabos-dev-internal-wa',
  // Where each role reaches the other over the internal network (Docker service
  // names in prod). Only used when role !== 'all'.
  waInternalUrl: process.env.WA_INTERNAL_URL ?? 'http://whatsapp:4000',
  storeInternalUrl: process.env.STORE_INTERNAL_URL ?? 'http://store:4000',
  // Product-image storage on Cloudflare R2 (S3-compatible). Empty account id =
  // uploads disabled (the endpoint returns 503). R2_PUBLIC_BASE_URL is the
  // public bucket URL (or custom domain) that the stored image_path is built on.
  r2AccountId: process.env.R2_ACCOUNT_ID ?? '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  r2Bucket: process.env.R2_BUCKET ?? '',
  r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
  dashboardToken: process.env.DASHBOARD_TOKEN ?? 'wabos-dev-token',
  // Postgres connection. Defaults to the local embedded dev server (`pnpm pg:dev`).
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:password@localhost:5433/wabos',
  // Optional schema override — tests point each suite at an isolated schema so
  // they don't clobber each other (the multi-tenant analogue of the old temp DB).
  pgSchema: process.env.WABOS_PG_SCHEMA ?? '',
  // Secret for signing dashboard JWTs (D2 auth). Override in production.
  jwtSecret: process.env.JWT_SECRET ?? 'wabos-dev-jwt-secret-change-me',
  // Google OAuth client id (public) for "Sign in with Google". Empty = disabled.
  // Must match NEXT_PUBLIC_GOOGLE_CLIENT_ID in the dashboard.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  // Locked-down CORS origin in production (the dashboard URL). Unset in dev →
  // permissive (true), which is fine for localhost.
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Platform-admin emails (comma-separated). A logged-in user whose email is in
  // this list can reach the cross-tenant /api/admin/* endpoints (ops overview).
  // Empty = admin console disabled for everyone.
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  // Platform billing via a Merchant of Record. Provider-selectable so the rail can
  // be swapped without touching routes/metering/UI. Empty keys = billing disabled
  // (checkout/portal return 503). Lemon Squeezy variant ids map to plan tiers.
  billingProvider: process.env.BILLING_PROVIDER ?? 'lemonsqueezy',
  lemonSqueezyApiKey: process.env.LEMONSQUEEZY_API_KEY ?? '',
  lemonSqueezyStoreId: process.env.LEMONSQUEEZY_STORE_ID ?? '',
  lemonSqueezyWebhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
  // Variant ids for the three self-serve plans, monthly + annual. Enterprise is
  // contact-us (no variant). Annual vars are optional — if unset, the annual
  // toggle simply can't check out that plan.
  lemonSqueezyVariantBasico: process.env.LEMONSQUEEZY_VARIANT_BASICO ?? '',
  lemonSqueezyVariantAvanzado: process.env.LEMONSQUEEZY_VARIANT_AVANZADO ?? '',
  lemonSqueezyVariantPro: process.env.LEMONSQUEEZY_VARIANT_PRO ?? '',
  lemonSqueezyVariantBasicoAnnual: process.env.LEMONSQUEEZY_VARIANT_BASICO_ANNUAL ?? '',
  lemonSqueezyVariantAvanzadoAnnual: process.env.LEMONSQUEEZY_VARIANT_AVANZADO_ANNUAL ?? '',
  lemonSqueezyVariantProAnnual: process.env.LEMONSQUEEZY_VARIANT_PRO_ANNUAL ?? '',
  // Where the checkout / customer portal redirects back to after payment, and
  // the base for password-reset links.
  dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
  // Outbound email (SMTP) for transactional mail like password resets. Empty
  // host = email disabled → reset links are logged to the console instead.
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFrom: process.env.SMTP_FROM ?? 'WABOS <no-reply@wabos.co>',
  // Shared secret between the marketing site and /api/public/contact. Optional:
  // when blank the endpoint stays open (still rate-limited + honeypotted).
  contactSecret: process.env.CONTACT_SECRET ?? '',
  aiModel: process.env.AI_MODEL ?? 'claude-sonnet-5',
  aiVisionModel: process.env.AI_VISION_MODEL ?? 'claude-haiku-4-5',
  // Per-conversation model tiering: everyone runs on the cheaper default model
  // until a conversation carries the sales tag, then it upgrades to the stronger
  // model. Halves blended cost while keeping quality where it closes sales.
  aiModelDefault: process.env.AI_MODEL_DEFAULT ?? 'claude-haiku-4-5',
  aiModelSales: process.env.AI_MODEL_SALES ?? 'claude-sonnet-5',
  // Anthropic prices (USD per million tokens) — used only for the admin console's
  // AI-spend estimate. Token usage doesn't record which model produced it, so this
  // is an estimate; keep these in sync with the Anthropic console for accuracy.
  aiPriceInputPerM: Number(process.env.AI_PRICE_INPUT_PER_M ?? '3'),
  aiPriceOutputPerM: Number(process.env.AI_PRICE_OUTPUT_PER_M ?? '15'),
  // Web push (VAPID). Empty keys = push disabled (subscribe endpoint returns 503).
  // Generate a pair once with `npx web-push generate-vapid-keys`.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:no-reply@wabos.co',
  // Firebase Cloud Messaging for native (Capacitor iOS/Android) push. Values come
  // from a Firebase service-account JSON. Empty = native push disabled. The private
  // key's newlines may be escaped as \n in the env var; we unescape at load.
  fcmProjectId: process.env.FCM_PROJECT_ID ?? '',
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
  fcmPrivateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  // Automated data backups. Empty dir = backups disabled (nothing scheduled). When
  // set, a verified JSON snapshot of all data tables is written daily; older ones
  // past the retention count are pruned.
  backupDir: process.env.BACKUP_DIR ?? '',
  backupRetention: Number(process.env.BACKUP_RETENTION ?? 14),
  rootDir,
  dataDir,
  mediaDir: path.join(dataDir, 'media'),
  authDir: path.join(rootDir, 'auth'),
};
