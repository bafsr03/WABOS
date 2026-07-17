import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tests point WABOS_DATA_DIR at a throwaway dir so each suite gets an isolated
// SQLite file/media dir; production leaves it unset and uses the package's data/.
const dataDir = process.env.WABOS_DATA_DIR
  ? path.resolve(process.env.WABOS_DATA_DIR)
  : path.join(rootDir, 'data');

export const config = {
  port: Number(process.env.PORT ?? 4000),
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
  // Platform billing via a Merchant of Record. Provider-selectable so the rail can
  // be swapped without touching routes/metering/UI. Empty keys = billing disabled
  // (checkout/portal return 503). Lemon Squeezy variant ids map to plan tiers.
  billingProvider: process.env.BILLING_PROVIDER ?? 'lemonsqueezy',
  lemonSqueezyApiKey: process.env.LEMONSQUEEZY_API_KEY ?? '',
  lemonSqueezyStoreId: process.env.LEMONSQUEEZY_STORE_ID ?? '',
  lemonSqueezyWebhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
  lemonSqueezyVariantPro: process.env.LEMONSQUEEZY_VARIANT_PRO ?? '',
  lemonSqueezyVariantEnterprise: process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE ?? '',
  // Where the checkout / customer portal redirects back to after payment.
  dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
  aiModel: process.env.AI_MODEL ?? 'claude-sonnet-5',
  aiVisionModel: process.env.AI_VISION_MODEL ?? 'claude-haiku-4-5',
  // Per-conversation model tiering: everyone runs on the cheaper default model
  // until a conversation carries the sales tag, then it upgrades to the stronger
  // model. Halves blended cost while keeping quality where it closes sales.
  aiModelDefault: process.env.AI_MODEL_DEFAULT ?? 'claude-haiku-4-5',
  aiModelSales: process.env.AI_MODEL_SALES ?? 'claude-sonnet-5',
  rootDir,
  dataDir,
  mediaDir: path.join(dataDir, 'media'),
  authDir: path.join(rootDir, 'auth'),
};
