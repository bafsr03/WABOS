import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus, type WabosEvent } from '../events.js';
import { one, many, none, getAllSettings, getSetting, setSetting } from '../db/index.js';
import { DEFAULT_BUSINESS_ID, runWithBusiness, currentBusinessId } from '../context.js';
import { registerUser, loginUser, loginWithGoogle, deleteAccount, verifyToken, resolveBusinessForUser, getUser, listUserBusinesses, createBusinessForUser, requestPasswordReset, resetPassword, changePassword } from '../modules/auth.js';
import { sendPasswordReset, sendMail, isEmailEnabled } from '../modules/mailer.js';
import { waState, waLogout, waChangeNumber, waSessionOpen, waSessionClose, waPurge } from '../wa/state.js';
import { registerInternalRoutes } from '../wa/internal-routes.js';
import { runsWhatsapp } from '../roles.js';
import { sendText } from '../wa/outbound.js';
import { isAiAvailable } from '../ai/employee.js';
import {
  listConversations, listMessages, getConversation,
  setConversationMode, markConversationRead, upsertContactByJid,
} from '../modules/store.js';
import { createBroadcast, getBroadcast, listBroadcasts } from '../modules/broadcasts.js';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, setConversationAgent } from '../modules/agents.js';
import {
  listCollections, createCollection, updateCollection, deleteCollection,
  listDocuments, createDocument, updateDocument, deleteDocument,
} from '../modules/knowledge.js';
import {
  createCharge, getCharge, listCharges, setChargeStatus,
  listReceipts, getMedia,
} from '../modules/charges.js';
import { approveReceipt, rejectReceipt, rekickPendingReceipts } from '../workers/receipt-verifier.js';
import { remindNow } from '../workers/collections.js';
import { insertNotification, listNotifications } from '../modules/payment-notifications.js';
import { getAnalytics } from '../modules/analytics.js';
import { createSale, voidSale, deleteSale, listSales, getDaySummary, getSalesSettings, attachSaleItems } from '../modules/sales.js';
import {
  addCashMovement, listCashMovements, getCashPosition,
  getCashSession, suggestOpeningAmount, openCashDay, closeCashDay, reopenCashDay,
} from '../modules/ledger.js';
import { composeDigest } from '../modules/digest.js';
import { sendDigestNow } from '../workers/digest.js';
import { runBackup, latestBackup } from '../workers/backup.js';
import { saveSubscription, removeSubscription, isPushConfigured, vapidPublicKey, saveDeviceToken, removeDeviceToken } from '../modules/push.js';
import { getPaymentSettings } from '../modules/charges.js';
import { featureFlags, getPlanTier, isFeatureEnabled, assertWithinLimit, getAiUsage } from '../modules/entitlements.js';
import { isAdminUser, getAdminOverview } from '../modules/admin.js';
import { createCheckoutSession, createPortalSession, handleWebhook, isBillingAvailable, changePlan, cancelSubscription, resumeSubscription, syncSubscriptionFromProvider } from '../modules/billing/index.js';
import { startAgentTest, sendTestMessage, deleteTestConversation } from '../modules/agent-testing.js';
import {
  createStyleAnalysis, getStyleAnalysis, getLatestStyleAnalysis,
  hasActiveStyleAnalysis, applyStyleProfile,
} from '../modules/style.js';
import { isAnalyzerAvailable } from '../ai/style-analyzer.js';
import {
  createImport, getLatestImport, getActiveImport, stopImport, startOnDemandBackfill,
} from '../modules/history-import.js';
import { mediaAbsolutePath } from '../wa/media.js';
import { templateCsv, importProductsCsv, PRODUCT_CSV_COLUMNS } from '../modules/products-csv.js';
import {
  adjustStock, logStockMovement, listStockMovements, listLowStock, getInventorySummary,
  createStockEntry, voidStockEntry, listStockEntries, getStockEntry,
} from '../modules/inventory.js';
import { isStorageConfigured, uploadProductImage } from '../modules/storage.js';
import fs from 'node:fs';

/* ---------------------------------------------------------------------------
   Public contact form (see POST /api/public/contact).

   CONTACT_TO is a module constant and is NEVER taken from the request body —
   that is what keeps an unauthenticated endpoint from becoming an open relay.
--------------------------------------------------------------------------- */
const CONTACT_TO = 'support@wabos.co';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const contactHits = new Map<string, number[]>();
let contactGlobal: number[] = [];
const CONTACT_WINDOW = 60 * 60_000;
const CONTACT_PER_IP = 5;
const CONTACT_GLOBAL = 50;

/** Second line of defence — the web tier limits too, but must not be trusted. */
function contactRateLimited(ip: string): boolean {
  const now = Date.now();
  contactGlobal = contactGlobal.filter((t) => now - t < CONTACT_WINDOW);
  if (contactGlobal.length >= CONTACT_GLOBAL) return true;

  const seen = (contactHits.get(ip) ?? []).filter((t) => now - t < CONTACT_WINDOW);
  if (seen.length >= CONTACT_PER_IP) { contactHits.set(ip, seen); return true; }

  seen.push(now);
  contactHits.set(ip, seen);
  contactGlobal.push(now);
  if (contactHits.size > 5000) {
    for (const [k, v] of contactHits) if (!v.some((t) => now - t < CONTACT_WINDOW)) contactHits.delete(k);
  }
  return false;
}

// Builds the fully-wired Fastify instance WITHOUT binding a port, so tests can
// drive it via app.inject(). startApi() below is the production entrypoint.
export async function buildApi() {
  // 12 MB body limit: a 5 MB product image base64-encodes to ~6.7 MB, plus CSV
  // imports. Default is 1 MB, which those would exceed.
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  // Production locks the origin to the dashboard URL; dev leaves it permissive.
  await app.register(cors, { origin: config.allowedOrigin || true });
  await app.register(websocket);

  // The whatsapp backend exposes an internal, key-gated surface (send + session
  // control) that the store backend calls over the Docker network. No-op traffic
  // in ROLE=all (the store code takes the local path instead).
  if (runsWhatsapp) registerInternalRoutes(app);

  // Parse JSON as usual but keep the raw bytes on the request — the billing
  // webhook needs the exact payload to verify its signature.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as any).rawBody = body;
    const text = (body as Buffer).toString('utf8');
    try {
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  // ---- auth ----------------------------------------------------------------
  // Callback-style hook so we can bind the tenant with als.run(store, done):
  // calling Fastify's `done` INSIDE runWithBusiness makes the whole downstream
  // request (all route handlers) inherit the AsyncLocalStorage context. (enterWith
  // from an async hook does NOT propagate to the handler.)
  app.addHook('onRequest', (req, reply, done) => {
    const url = req.url;
    if (!url.startsWith('/api/')) return done();
    // Webhooks authenticate with their own per-business secret; register/login
    // are the unauthenticated entry points.
    if (url.startsWith('/api/webhooks/')) return done();
    // /api/public/* is the deliberately unauthenticated namespace (marketing
    // contact form). Handlers there are tenant-less and rate-limited on their own.
    if (url.startsWith('/api/public/')) return done();
    if (url.startsWith('/api/auth/register') || url.startsWith('/api/auth/login') || url.startsWith('/api/auth/google')
        || url.startsWith('/api/auth/forgot') || url.startsWith('/api/auth/reset')) return done();

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    // Legacy bypass: the static dashboard token maps to the original business
    // (STAND 120), so its existing session keeps working post-cutover.
    if (token && token === config.dashboardToken) {
      return runWithBusiness(DEFAULT_BUSINESS_ID, done);
    }

    // Otherwise it's a user JWT → resolve the acting business from membership.
    (async () => {
      const uid = token ? await verifyToken(token) : null;
      if (!uid) { reply.code(401).send({ error: 'Unauthorized' }); return; }
      const requested = req.headers['x-business-id'] ? Number(req.headers['x-business-id']) : undefined;
      const businessId = await resolveBusinessForUser(uid, requested);
      if (!businessId) { reply.code(403).send({ error: 'No business access' }); return; }
      (req as any).uid = uid;
      runWithBusiness(businessId, done);
    })().catch(done);
  });

  // ---- public (unauthenticated) routes ---------------------------------------
  // Contact form on wabos.co. The marketing site forwards to this over the
  // internal network; it is NOT called by a browser (the engine's CORS is locked
  // to the dashboard origin).
  app.post('/api/public/contact', async (req, reply) => {
    if (config.contactSecret && req.headers['x-wabos-contact'] !== config.contactSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip;
    if (contactRateLimited(ip)) {
      return reply.code(429).send({ error: 'Demasiados intentos' });
    }

    const body = z.object({
      nombre: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(160),
      mensaje: z.string().trim().min(10).max(2000),
      negocio: z.string().trim().max(120).optional().default(''),
      telefono: z.string().trim().max(30).optional().default(''),
    }).parse(req.body);

    const lines = [
      `Nombre: ${body.nombre}`,
      `Correo: ${body.email}`,
      body.negocio ? `Negocio: ${body.negocio}` : null,
      body.telefono ? `Teléfono: ${body.telefono}` : null,
      '',
      body.mensaje,
    ].filter(Boolean).join('\n');

    if (!isEmailEnabled()) {
      // Nothing vanishes silently while SMTP is unconfigured.
      logger.warn({ contact: body }, 'CONTACT SUBMISSION (email disabled — configure SMTP_* to deliver)');
      return { ok: true, delivered: false };
    }

    await sendMail({
      to: CONTACT_TO,
      replyTo: body.email,
      subject: `[wabos.co] ${body.nombre}`,
      text: lines,
      html: `<table cellpadding="6">
<tr><td><b>Nombre</b></td><td>${esc(body.nombre)}</td></tr>
<tr><td><b>Correo</b></td><td>${esc(body.email)}</td></tr>
${body.negocio ? `<tr><td><b>Negocio</b></td><td>${esc(body.negocio)}</td></tr>` : ''}
${body.telefono ? `<tr><td><b>Teléfono</b></td><td>${esc(body.telefono)}</td></tr>` : ''}
</table>
<p style="white-space:pre-wrap">${esc(body.mensaje)}</p>`,
    });
    return { ok: true, delivered: true };
  });

  // ---- auth routes ----------------------------------------------------------
  app.post('/api/auth/register', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
      business_name: z.string().min(1),
    }).parse(req.body);
    try {
      const result = await registerUser(body.email, body.password, body.business_name);
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err.code === 'EMAIL_TAKEN') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    try {
      return await loginUser(body.email, body.password);
    } catch (err: any) {
      if (err.code === 'INVALID_CREDENTIALS') return reply.code(401).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/auth/google', async (req, reply) => {
    const body = z.object({ credential: z.string().min(1) }).parse(req.body);
    try {
      return await loginWithGoogle(body.credential);
    } catch (err: any) {
      if (err.code === 'INVALID_CREDENTIALS') return reply.code(401).send({ error: err.message });
      if (err.code === 'GOOGLE_NOT_CONFIGURED') return reply.code(503).send({ error: err.message });
      throw err;
    }
  });

  // Request a reset link. Always 200 (never reveal whether the email exists).
  app.post('/api/auth/forgot', async (req) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const result = await requestPasswordReset(body.email);
    if (result) {
      const link = `${config.dashboardUrl}/reset?token=${result.token}`;
      await sendPasswordReset(result.user.email, link).catch((err) => logger.error({ err }, 'reset email failed'));
    }
    return { ok: true };
  });

  // Consume a reset token and set a new password.
  app.post('/api/auth/reset', async (req, reply) => {
    const body = z.object({ token: z.string().min(1), password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres') }).parse(req.body);
    const ok = await resetPassword(body.token, body.password);
    if (!ok) return reply.code(400).send({ error: 'El enlace es inválido o expiró. Solicita uno nuevo.' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const uid = (req as any).uid as number | undefined;
    if (!uid) {
      // Legacy-token session: no user row, just the bound business.
      const b = await one('SELECT id, name, plan_tier FROM businesses WHERE id = $1', [currentBusinessId()]);
      return { user: null, businesses: b ? [{ ...b, role: 'owner' }] : [] };
    }
    return { user: await getUser(uid), businesses: await listUserBusinesses(uid) };
  });

  // Change password for the logged-in user (verifies the current one). Authed —
  // goes through the onRequest hook, so (req as any).uid is set.
  app.post('/api/auth/change-password', async (req, reply) => {
    const uid = (req as any).uid as number | undefined;
    if (!uid) return reply.code(401).send({ error: 'Unauthorized' });
    const body = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
    }).parse(req.body);
    try {
      await changePassword(uid, body.current_password, body.new_password);
      return { ok: true };
    } catch (err: any) {
      if (err.code === 'INVALID_CREDENTIALS') return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // Create an additional workspace owned by the current user (the "+ Nuevo
  // espacio" action in the switcher). Legacy-token sessions can't own new ones.
  app.post('/api/businesses', async (req, reply) => {
    const uid = (req as any).uid as number | undefined;
    if (!uid) return reply.code(400).send({ error: 'Esta sesión no puede crear espacios' });
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    return reply.code(201).send(await createBusinessForUser(uid, body.name));
  });

  // ---- billing (Merchant of Record) -----------------------------------------
  app.post('/api/billing/checkout', async (req, reply) => {
    const body = z.object({
      tier: z.enum(['basico', 'avanzado', 'pro']),
      interval: z.enum(['month', 'year']).default('month'),
    }).parse(req.body);
    try {
      return { url: await createCheckoutSession(body.tier, body.interval) };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      if (err.code === 'BAD_PLAN') return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/billing/portal', async (_req, reply) => {
    try {
      return { url: await createPortalSession() };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      if (err.code === 'NO_SUBSCRIPTION') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Switch an EXISTING subscription to another plan/interval (proration handled
  // by Lemon Squeezy — no new subscription). Use this instead of /checkout when
  // the business already has a subscription.
  app.post('/api/billing/change', async (req, reply) => {
    const body = z.object({
      tier: z.enum(['basico', 'avanzado', 'pro']),
      interval: z.enum(['month', 'year']).default('month'),
    }).parse(req.body);
    try {
      await changePlan(body.tier, body.interval);
      return { ok: true };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      if (err.code === 'NO_SUBSCRIPTION') return reply.code(409).send({ error: err.message });
      if (err.code === 'BAD_PLAN') return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/billing/cancel', async (_req, reply) => {
    try {
      await cancelSubscription();
      return { ok: true };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      if (err.code === 'NO_SUBSCRIPTION') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.post('/api/billing/resume', async (_req, reply) => {
    try {
      await resumeSubscription();
      return { ok: true };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      if (err.code === 'NO_SUBSCRIPTION') return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // Webhook-independent reconcile — pull the subscription from the provider and
  // apply it. Called after checkout (and by a manual "refresh" in the UI) so the
  // plan reflects even if the webhook was missed.
  app.post('/api/billing/sync', async (_req, reply) => {
    try {
      return { ok: true, found: await syncSubscriptionFromProvider() };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      throw err;
    }
  });

  // Permanently delete the account + all owned businesses and their data. Only
  // available to real user sessions (not the legacy dashboard token).
  app.delete('/api/account', async (req, reply) => {
    const uid = (req as any).uid as number | undefined;
    if (!uid) return reply.code(400).send({ error: 'Esta sesión no puede eliminar la cuenta' });
    const businesses = await listUserBusinesses(uid);
    for (const b of businesses) await waPurge(b.id); // stop socket + delete creds
    await deleteAccount(uid);
    return { ok: true };
  });

  // ---- realtime ------------------------------------------------------------
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const token = params.get('token') ?? '';
    const requested = params.get('businessId') ? Number(params.get('businessId')) : undefined;
    // Resolve the socket's business: legacy token → STAND 120, else a user JWT
    // scoped to the requested workspace (membership enforced) or their first one.
    let businessId: number | null = null;
    if (token === config.dashboardToken) businessId = DEFAULT_BUSINESS_ID;
    else {
      const uid = token ? await verifyToken(token) : null;
      if (uid) businessId = await resolveBusinessForUser(uid, requested);
    }
    if (!businessId) { socket.close(4001, 'Unauthorized'); return; }

    // Only forward events belonging to this socket's business. Events are stamped
    // with businessId at emit time (see events.ts); untenanted events pass through.
    const forward = (event: WabosEvent) => {
      const evBiz = (event as any).businessId;
      if (evBiz !== undefined && evBiz !== businessId) return;
      try { socket.send(JSON.stringify(event)); } catch { /* client gone */ }
    };
    bus.on('event', forward);
    socket.on('close', () => bus.off('event', forward));
    const wa = await waState(businessId);
    forward({ type: 'wa.status', businessId, status: wa.status, qr: wa.qr, me: wa.me });
  });

  // ---- whatsapp connection -------------------------------------------------
  app.get('/api/status', async () => {
    const wa = await waState();
    const usage = await getAiUsage();
    const biz = await one<{ subscription_status: string | null; current_period_end: number | null }>(
      'SELECT subscription_status, current_period_end FROM businesses WHERE id = $1', [currentBusinessId()]);
    return {
      ...wa,
      qrDataUrl: wa.qr ? await QRCode.toDataURL(wa.qr, { margin: 1, width: 320 }) : null,
      aiAvailable: isAiAvailable(),
      planTier: await getPlanTier(),
      features: await featureFlags(),
      accountPhone: await getSetting('account_phone', ''),
      billingAvailable: isBillingAvailable(),
      subscriptionStatus: biz?.subscription_status ?? null,
      currentPeriodEnd: biz?.current_period_end ?? null,
      usage: {
        aiMessages: usage.messages,
        aiMessagesLimit: usage.limit === Number.POSITIVE_INFINITY ? null : usage.limit,
        period: usage.period,
      },
    };
  });

  // ---- platform admin (owner-only, cross-tenant ops console) ----------------
  // Gated by email ∈ config.adminEmails; unlike every other route this reads
  // across all businesses. Non-admins get 403 even with a valid session.
  app.get('/api/admin/overview', async (req, reply) => {
    if (!(await isAdminUser((req as any).uid))) {
      return reply.code(403).send({ error: 'Acceso restringido' });
    }
    return getAdminOverview();
  });

  app.post('/api/logout', async () => {
    await waLogout();
    return { ok: true };
  });

  // Change numbers: keep brand assets + CRM, reset the old number's chats/money,
  // then re-issue a QR for the new number.
  app.post('/api/change-number', async () => {
    await waChangeNumber();
    return { ok: true };
  });

  // Dashboard session lifecycle: closing the app session pauses the WhatsApp
  // socket but keeps the link + all data; logging back in resumes it.
  app.post('/api/session/close', async () => {
    await waSessionClose();
    return { ok: true };
  });

  app.post('/api/session/open', async () => {
    await waSessionOpen();
    return { ok: true };
  });

  // ---- conversations & messages ---------------------------------------------
  app.get('/api/conversations', async () => listConversations());

  app.get('/api/conversations/:id/messages', async (req) => {
    const id = Number((req.params as any).id);
    return { conversation: await getConversation(id), messages: await listMessages(id, 200) };
  });

  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    if (!(await getConversation(id))) return reply.code(404).send({ error: 'Conversation not found' });
    // A manual reply means a human is handling this thread now
    await setConversationMode(id, 'human');
    const ok = await sendText({ conversationId: id, text: body.text, humanized: false });
    return { ok };
  });

  app.post('/api/conversations/:id/mode', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({ mode: z.enum(['ai', 'human']) }).parse(req.body);
    await setConversationMode(id, body.mode);
    return { ok: true };
  });

  app.post('/api/conversations/:id/agent', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ agentId: z.number().int() }).parse(req.body);
    if (!(await getConversation(id))) return reply.code(404).send({ error: 'Conversation not found' });
    if (!(await getAgent(body.agentId))) return reply.code(404).send({ error: 'Agent not found' });
    await setConversationAgent(id, body.agentId);
    return { ok: true };
  });

  // ---- agents -----------------------------------------------------------------
  app.get('/api/agents', async () => listAgents());

  app.post('/api/agents', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      slug: z.string().optional(),
      description: z.string().optional(),
      persona: z.string().optional(),
      ai_tone: z.string().optional(),
      ai_instructions: z.string().optional(),
      model_default: z.string().optional(),
      model_sales: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);
    await assertWithinLimit('agents');
    return reply.code(201).send(await createAgent(body));
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({
      name: z.string().min(1).optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      persona: z.string().optional(),
      ai_tone: z.string().optional(),
      ai_instructions: z.string().optional(),
      model_default: z.string().optional(),
      model_sales: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);
    const updated = await updateAgent(id, body);
    if (!updated) return reply.code(404).send({ error: 'Agent not found' });
    return updated;
  });

  app.delete('/api/agents/:id', async (req, reply) => {
    const res = await deleteAgent(Number((req.params as any).id));
    if (!res.ok) return reply.code(res.error === 'Agent not found' ? 404 : 409).send({ error: res.error });
    return { ok: true };
  });

  // ---- agent testing (drive an agent in the Inbox without a real WhatsApp) ----
  // Create/reset a test conversation pinned to this agent; returns its id so the
  // dashboard can deep-link to /inbox?c=<id>.
  app.post('/api/agents/:id/test', async (req, reply) => {
    const agentId = Number((req.params as any).id);
    if (!(await getAgent(agentId))) return reply.code(404).send({ error: 'Agent not found' });
    return reply.code(201).send(await startAgentTest(agentId));
  });

  // Send a message AS the customer into a test conversation and run the AI. The
  // reply is delivered socket-free and streams back over the websocket.
  app.post('/api/conversations/:id/test-messages', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const result = await sendTestMessage(id, body.text);
    if (!result.ok) return reply.code(result.error === 'Not a test conversation' ? 400 : 404).send({ error: result.error });
    return { ok: true };
  });

  app.delete('/api/conversations/:id/test', async (req, reply) => {
    const id = Number((req.params as any).id);
    const result = await deleteTestConversation(id);
    if (!result.ok) return reply.code(result.error === 'Not a test conversation' ? 400 : 404).send({ error: result.error });
    return { ok: true };
  });

  app.post('/api/conversations/:id/read', async (req) => {
    await markConversationRead(Number((req.params as any).id));
    return { ok: true };
  });

  // ---- contacts & tags -------------------------------------------------------
  app.get('/api/contacts', async () => {
    return many(`
      SELECT c.*, (
        SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name)), '[]'::json)
        FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = c.id
      ) AS tags,
      (SELECT id FROM conversations WHERE contact_id = c.id) AS conversation_id
      FROM contacts c WHERE c.business_id = $1 AND c.is_test = 0 ORDER BY c.created_at DESC
    `, [currentBusinessId()]);
  });

  app.post('/api/contacts', async (req, reply) => {
    const body = z.object({
      phone: z.string().min(6).regex(/^\+?\d+$/, 'Digits only, e.g. 51987654321'),
      name: z.string().default(''),
    }).parse(req.body);
    await assertWithinLimit('contacts');
    const phone = body.phone.replace('+', '');
    const contact = await upsertContactByJid(`${phone}@s.whatsapp.net`, body.name || undefined);
    if (body.name) await none('UPDATE contacts SET name = $1 WHERE id = $2', [body.name, contact.id]);
    return reply.code(201).send(await one('SELECT * FROM contacts WHERE id = $1', [contact.id]));
  });

  app.patch('/api/contacts/:id', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({ name: z.string().optional(), notes: z.string().optional() }).parse(req.body);
    if (body.name !== undefined) await none('UPDATE contacts SET name = $1 WHERE id = $2 AND business_id = $3', [body.name, id, currentBusinessId()]);
    if (body.notes !== undefined) await none('UPDATE contacts SET notes = $1 WHERE id = $2 AND business_id = $3', [body.notes, id, currentBusinessId()]);
    return one('SELECT * FROM contacts WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  });

  app.delete('/api/contacts/:id', async (req) => {
    await none('DELETE FROM contacts WHERE id = $1 AND business_id = $2', [Number((req.params as any).id), currentBusinessId()]);
    return { ok: true };
  });

  app.get('/api/tags', async () => many('SELECT * FROM tags WHERE business_id = $1 ORDER BY name', [currentBusinessId()]));

  app.post('/api/contacts/:id/tags', async (req) => {
    const contactId = Number((req.params as any).id);
    const body = z.object({ tag: z.string().min(1) }).parse(req.body);
    const tag = body.tag.trim().toLowerCase();
    const businessId = currentBusinessId();
    await none('INSERT INTO tags (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, lower(name)) DO NOTHING', [businessId, tag]);
    const tagRow = (await one<{ id: number }>('SELECT id FROM tags WHERE business_id = $1 AND lower(name) = lower($2)', [businessId, tag]))!;
    await none('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [contactId, tagRow.id]);
    return { ok: true };
  });

  app.delete('/api/contacts/:id/tags/:tagId', async (req) => {
    const { id, tagId } = req.params as any;
    await none('DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2', [Number(id), Number(tagId)]);
    return { ok: true };
  });

  // ---- catalog ----------------------------------------------------------------
  app.get('/api/products', async () => many('SELECT * FROM products WHERE business_id = $1 ORDER BY created_at DESC', [currentBusinessId()]));

  app.post('/api/products', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().default(''),
      price: z.number().nonnegative(),
      currency: z.string().default('PEN'),
      cost: z.number().nonnegative().nullable().optional(),
      sku: z.string().nullable().optional(),
      category: z.string().optional(),
      stock: z.number().int().nullable().optional(),
      trackStock: z.boolean().optional(),
      imagePath: z.string().nullable().optional(),
    }).parse(req.body);
    await assertWithinLimit('products'); // tier cap (402 PLAN_LIMIT when exceeded)
    const row = await one<any>(
      'INSERT INTO products (business_id, name, description, price, currency, cost, sku, category, stock, track_stock, image_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [currentBusinessId(), body.name, body.description, body.price, body.currency, body.cost ?? null, body.sku ?? null, body.category ?? '', body.stock ?? null, body.trackStock ? 1 : 0, body.imagePath ?? null]);
    // Opening quantity: nothing to adjust (it was inserted), just record its origin
    // so the movement history starts where the product does.
    if (row && body.trackStock && body.stock) {
      await logStockMovement({
        productId: row.id, productName: body.name, kind: 'count', origin: 'dashboard',
        qtyDelta: body.stock, stockAfter: body.stock, unitCost: body.cost ?? null,
        refType: 'product', refId: row.id, note: 'Stock inicial',
      });
    }
    return reply.code(201).send(row);
  });

  app.patch('/api/products/:id', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.number().nonnegative().optional(),
      currency: z.string().optional(),
      active: z.boolean().optional(),
      cost: z.number().nonnegative().nullable().optional(),
      sku: z.string().nullable().optional(),
      category: z.string().optional(),
      stock: z.number().int().nullable().optional(),
      trackStock: z.boolean().optional(),
      imagePath: z.string().nullable().optional(),
    }).parse(req.body);
    const current = await one<any>('SELECT * FROM products WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
    if (!current) return { error: 'Not found' };
    const nextTrack = body.trackStock === undefined ? current.track_stock : body.trackStock ? 1 : 0;
    // `stock` is deliberately absent from this UPDATE — it moves through
    // adjustStock below so an edit from the catalog lands in the history too.
    await none('UPDATE products SET name = $1, description = $2, price = $3, currency = $4, active = $5, cost = $6, sku = $7, category = $8, track_stock = $9, image_path = $10 WHERE id = $11',
      [
        body.name ?? current.name,
        body.description ?? current.description,
        body.price ?? current.price,
        body.currency ?? current.currency,
        body.active === undefined ? current.active : body.active ? 1 : 0,
        body.cost === undefined ? current.cost : body.cost,
        body.sku === undefined ? current.sku : body.sku,
        body.category === undefined ? current.category : body.category,
        nextTrack,
        body.imagePath === undefined ? current.image_path : body.imagePath,
        id,
      ]);
    if (body.stock !== undefined && body.stock !== null && body.stock !== current.stock && nextTrack === 1) {
      await adjustStock({
        productId: id, setTo: body.stock, kind: 'count', origin: 'dashboard',
        enableTracking: true, refType: 'product', refId: id, note: 'Ajuste desde el catálogo',
      });
    }
    return one('SELECT * FROM products WHERE id = $1', [id]);
  });

  // Quick stock adjustment (delta or absolute) without touching the rest of the
  // product. `set` is a recount, `delta` is a correction — the history says which.
  app.post('/api/products/:id/stock', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({
      delta: z.number().int().optional(),
      set: z.number().int().nonnegative().optional(),
      note: z.string().max(200).optional(),
    }).parse(req.body ?? {});
    if (body.delta === undefined && body.set === undefined) {
      return reply.code(400).send({ error: 'Indica `delta` o `set`' });
    }
    const current = await one<any>('SELECT id FROM products WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
    if (!current) return reply.code(404).send({ error: 'Not found' });
    await adjustStock({
      productId: id,
      ...(body.set !== undefined ? { setTo: body.set, kind: 'count' as const } : { qtyDelta: body.delta, kind: 'adjustment' as const }),
      origin: 'dashboard',
      enableTracking: true,
      note: body.note ?? '',
    });
    return one('SELECT * FROM products WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  });

  app.delete('/api/products/:id', async (req) => {
    await none('DELETE FROM products WHERE id = $1 AND business_id = $2', [Number((req.params as any).id), currentBusinessId()]);
    return { ok: true };
  });

  // ---- catalog: bulk CSV import / export -------------------------------------
  // A ready-to-fill template so owners can organize their inventory in a
  // spreadsheet and push it back in one file.
  app.get('/api/products/template.csv', async (_req, reply) => {
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="plantilla-inventario.csv"')
      .send(templateCsv());
  });

  // Export the current catalog in the same column shape as the template, so an
  // export can be edited and re-imported round-trip.
  app.get('/api/products/export.csv', async (_req, reply) => {
    const rows = await many<any>(
      'SELECT sku, name, description, category, price, cost, currency, stock, track_stock, active FROM products WHERE business_id = $1 ORDER BY created_at DESC',
      [currentBusinessId()]);
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [PRODUCT_CSV_COLUMNS.join(','), ...rows.map((r) => PRODUCT_CSV_COLUMNS.map((c) => esc(r[c])).join(','))].join('\n');
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="inventario.csv"').send(csv);
  });

  // Import: the dashboard reads the chosen file client-side and posts its text as
  // JSON, so no multipart handling is needed. Upserts by SKU; reports per-row errors.
  app.post('/api/products/import', async (req) => {
    const body = z.object({ csv: z.string().min(1) }).parse(req.body);
    return importProductsCsv(body.csv);
  });

  // Upload a product photo to Cloudflare R2. The dashboard reads the file and
  // posts it base64-encoded (no multipart needed); we store the public R2 URL in
  // products.image_path so the catalog renders it straight from R2.
  app.post('/api/products/:id/image', async (req, reply) => {
    if (!isStorageConfigured()) return reply.code(503).send({ error: 'El almacenamiento de imágenes no está configurado' });
    const id = Number((req.params as any).id);
    const body = z.object({
      contentType: z.string().min(1),
      data: z.string().min(1), // base64 (no data: URI prefix)
    }).parse(req.body);
    const product = await one<any>('SELECT id FROM products WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
    if (!product) return reply.code(404).send({ error: 'Producto no encontrado' });
    const buffer = Buffer.from(body.data, 'base64');
    if (buffer.length === 0) return reply.code(400).send({ error: 'Imagen vacía' });
    if (buffer.length > 5 * 1024 * 1024) return reply.code(413).send({ error: 'La imagen supera 5 MB' });
    try {
      const url = await uploadProductImage(currentBusinessId(), id, buffer, body.contentType);
      await none('UPDATE products SET image_path = $1 WHERE id = $2 AND business_id = $3', [url, id, currentBusinessId()]);
      return { imagePath: url };
    } catch (err: any) {
      if (err.code === 'BAD_IMAGE') return reply.code(400).send({ error: err.message });
      logger.error({ err }, 'product image upload failed');
      return reply.code(502).send({ error: 'No se pudo subir la imagen' });
    }
  });

  // ---- inventory: movements + recepciones -------------------------------------
  app.get('/api/inventory/summary', async () => getInventorySummary());
  app.get('/api/inventory/low-stock', async () => listLowStock());

  const stockKind = z.enum(['entry', 'sale', 'void', 'adjustment', 'count', 'import']);
  const stockOrigin = z.enum(['dashboard', 'pos', 'ai', 'import', 'system']);

  app.get('/api/stock/movements', async (req) => {
    const q = z.object({
      productId: z.coerce.number().int().optional(),
      kind: stockKind.optional(),
      origin: stockOrigin.optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().positive().max(200).default(50),
      offset: z.coerce.number().int().nonnegative().default(0),
    }).parse(req.query ?? {});
    return listStockMovements(q);
  });

  app.get('/api/stock/entries', async (req) => {
    const q = z.object({
      limit: z.coerce.number().int().positive().max(200).default(50),
      offset: z.coerce.number().int().nonnegative().default(0),
    }).parse(req.query ?? {});
    return listStockEntries(q);
  });

  app.get('/api/stock/entries/:id', async (req, reply) => {
    const entry = await getStockEntry(Number((req.params as any).id));
    if (!entry) return reply.code(404).send({ error: 'Recepción no encontrada' });
    return entry;
  });

  app.post('/api/stock/entries', async (req, reply) => {
    const body = z.object({
      supplier: z.string().max(120).default(''),
      note: z.string().max(300).default(''),
      receivedAt: z.number().int().positive().optional(),
      postExpense: z.boolean().default(false),
      items: z.array(z.object({
        productId: z.number().int(),
        qty: z.number().positive(),
        unitCost: z.number().nonnegative(),
      })).min(1),
    }).parse(req.body);
    try {
      return reply.code(201).send(await createStockEntry(body));
    } catch (err: any) {
      if (['FRACTIONAL_STOCK', 'PRODUCT_NOT_FOUND', 'EMPTY_ENTRY'].includes(err?.code)) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post('/api/stock/entries/:id/void', async (req, reply) => {
    const res = await voidStockEntry(Number((req.params as any).id));
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  // ---- FAQs ---------------------------------------------------------------------
  app.get('/api/faqs', async () => many('SELECT * FROM faqs WHERE business_id = $1 ORDER BY id', [currentBusinessId()]));

  app.post('/api/faqs', async (req, reply) => {
    const body = z.object({ question: z.string().min(1), answer: z.string().min(1) }).parse(req.body);
    const row = await one('INSERT INTO faqs (business_id, question, answer) VALUES ($1, $2, $3) RETURNING *',
      [currentBusinessId(), body.question, body.answer]);
    return reply.code(201).send(row);
  });

  app.delete('/api/faqs/:id', async (req) => {
    await none('DELETE FROM faqs WHERE id = $1 AND business_id = $2', [Number((req.params as any).id), currentBusinessId()]);
    return { ok: true };
  });

  // ---- knowledge base ---------------------------------------------------------
  app.get('/api/knowledge/collections', async () => listCollections());

  app.post('/api/knowledge/collections', async (req, reply) => {
    const body = z.object({ name: z.string().min(1), description: z.string().optional(), sort_order: z.number().int().optional() }).parse(req.body);
    return reply.code(201).send(await createCollection(body));
  });

  app.patch('/api/knowledge/collections/:id', async (req, reply) => {
    const body = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), sort_order: z.number().int().optional() }).parse(req.body);
    const updated = await updateCollection(Number((req.params as any).id), body);
    if (!updated) return reply.code(404).send({ error: 'Collection not found' });
    return updated;
  });

  app.delete('/api/knowledge/collections/:id', async (req, reply) => {
    if (!(await deleteCollection(Number((req.params as any).id)))) return reply.code(404).send({ error: 'Collection not found' });
    return { ok: true };
  });

  app.get('/api/knowledge/documents', async (req) => {
    const collectionId = (req.query as any)?.collection_id;
    return listDocuments(collectionId !== undefined ? Number(collectionId) : undefined);
  });

  const documentBody = z.object({
    title: z.string().min(1),
    kind: z.enum(['policy', 'guide', 'brand', 'faq', 'other']).optional(),
    collection_id: z.number().int().nullable().optional(),
    summary: z.string().optional(),
    content: z.string().optional(),
    keywords: z.string().optional(),
    pinned: z.boolean().optional(),
    active: z.boolean().optional(),
  });

  app.post('/api/knowledge/documents', async (req, reply) => {
    return reply.code(201).send(await createDocument(documentBody.parse(req.body)));
  });

  app.patch('/api/knowledge/documents/:id', async (req, reply) => {
    const updated = await updateDocument(Number((req.params as any).id), documentBody.partial().parse(req.body));
    if (!updated) return reply.code(404).send({ error: 'Document not found' });
    return updated;
  });

  app.delete('/api/knowledge/documents/:id', async (req, reply) => {
    if (!(await deleteDocument(Number((req.params as any).id)))) return reply.code(404).send({ error: 'Document not found' });
    return { ok: true };
  });

  // ---- settings -------------------------------------------------------------------
  app.get('/api/settings', async () => ({ ...(await getAllSettings()), _aiAvailable: isAiAvailable() }));

  app.put('/api/settings', async (req) => {
    const body = z.record(z.string()).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith('_')) continue;
      await setSetting(key, value);
    }
    return getAllSettings();
  });

  // ---- voice DNA (style analysis) ---------------------------------------------------
  const serializeAnalysis = (a: any) => a && { ...a, profile: a.profile ? JSON.parse(a.profile) : null };

  app.post('/api/style/analyze', async (_req, reply) => {
    if (!(await isFeatureEnabled('style_analysis'))) {
      return reply.code(402).send({ error: 'Función premium no disponible en tu plan' });
    }
    if (!isAnalyzerAvailable()) {
      return reply.code(409).send({ error: 'La IA no está configurada (falta ANTHROPIC_API_KEY)' });
    }
    if (await hasActiveStyleAnalysis()) {
      return reply.code(409).send({ error: 'Ya hay un análisis en curso' });
    }
    return reply.code(201).send(serializeAnalysis(await createStyleAnalysis()));
  });

  app.get('/api/style/latest', async () => serializeAnalysis(await getLatestStyleAnalysis()) ?? null);

  app.get('/api/style/:id', async (req, reply) => {
    const a = await getStyleAnalysis(Number((req.params as any).id));
    if (!a) return reply.code(404).send({ error: 'Analysis not found' });
    return serializeAnalysis(a);
  });

  app.post('/api/style/:id/apply', async (req, reply) => {
    const body = z.object({ agentId: z.number().int().optional() }).parse(req.body ?? {});
    const applied = await applyStyleProfile(Number((req.params as any).id), body.agentId);
    if (!applied) return reply.code(409).send({ error: 'El análisis no está listo para aplicar' });
    return serializeAnalysis(applied);
  });

  // ---- whatsapp history import (opt-in) ---------------------------------------------
  app.get('/api/history/status', async () => {
    const row = (await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.business_id = $1', [currentBusinessId()]))!;
    return {
      import: await getLatestImport() ?? null,
      storedMessages: row.n,
      fullSync: (await getSetting('history_full_sync', '0')) === '1',
    };
  });

  app.post('/api/history/import', async (req, reply) => {
    const body = z.object({ mode: z.enum(['on_demand', 'full_rescan']) }).parse(req.body ?? {});
    if ((await waState()).status !== 'connected') {
      return reply.code(409).send({ error: 'WhatsApp no está conectado' });
    }
    if (await getActiveImport()) {
      return reply.code(409).send({ error: 'Ya hay una importación en curso' });
    }
    if (body.mode === 'on_demand') {
      const imp = await createImport('on_demand');
      void startOnDemandBackfill(imp.id); // fire-and-forget; progress streams over the bus
      return reply.code(201).send(imp);
    }
    // full_rescan: enable full sync and tell the client to re-link. The backlog
    // lands after logout → QR → reconnect and is ingested by the gated handler.
    await setSetting('history_full_sync', '1');
    await createImport('sync');
    return reply.code(201).send({ relink: true });
  });

  app.post('/api/history/stop', async () => ({ ok: true, import: await stopImport() ?? null }));

  // ---- broadcasts -------------------------------------------------------------------
  app.get('/api/broadcasts', async () => listBroadcasts());

  app.get('/api/broadcasts/:id', async (req) => getBroadcast(Number((req.params as any).id)));

  app.post('/api/broadcasts', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      message: z.string().min(1),
      tagId: z.number().nullable().optional(),
    }).parse(req.body);
    if ((await waState()).status !== 'connected') {
      return reply.code(409).send({ error: 'WhatsApp is not connected' });
    }
    try {
      return reply.code(201).send(await createBroadcast({ name: body.name, message: body.message, tagId: body.tagId ?? null }));
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ---- payments: charges, receipts, media -------------------------------------------
  app.get('/api/charges', async (req) => {
    const query = z.object({
      status: z.enum(['pending', 'paid', 'review', 'rejected', 'expired', 'cancelled']).optional(),
    }).parse(req.query ?? {});
    return listCharges(query.status);
  });

  app.post('/api/charges', async (req, reply) => {
    const body = z.object({
      contactId: z.number().int().positive(),
      amount: z.number().positive(),
      currency: z.string().default('PEN'),
      concept: z.string().default(''),
      dueAt: z.number().int().nullable().optional(),
    }).parse(req.body);
    if (!(await one('SELECT id FROM contacts WHERE id = $1 AND business_id = $2', [body.contactId, currentBusinessId()]))) {
      return reply.code(404).send({ error: 'Contact not found' });
    }
    return reply.code(201).send(await createCharge({
      contactId: body.contactId,
      amount: body.amount,
      currency: body.currency,
      concept: body.concept,
      dueAt: body.dueAt ?? null,
    }));
  });

  app.post('/api/charges/:id/cancel', async (req, reply) => {
    const id = Number((req.params as any).id);
    const charge = await getCharge(id);
    if (!charge) return reply.code(404).send({ error: 'Charge not found' });
    if (charge.status === 'paid') return reply.code(409).send({ error: 'Charge is already paid' });
    if (charge.status !== 'cancelled') await setChargeStatus(id, 'cancelled');
    return { ok: true };
  });

  app.post('/api/charges/:id/remind', async (req, reply) => {
    const result = await remindNow(Number((req.params as any).id));
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return { ok: true };
  });

  app.get('/api/receipts', async (req) => {
    const query = z.object({
      outcome: z.enum(['pending', 'auto_verified', 'review', 'rejected', 'not_receipt', 'manual_verified', 'manual_rejected']).optional(),
    }).parse(req.query ?? {});
    return (await listReceipts(query.outcome)).map((r: any) => ({ ...r, reasons: JSON.parse(r.reasons) }));
  });

  app.post('/api/receipts/:id/approve', async (req, reply) => {
    const result = await approveReceipt(Number((req.params as any).id));
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return { ok: true };
  });

  app.post('/api/receipts/:id/reject', async (req, reply) => {
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const result = await rejectReceipt(Number((req.params as any).id), body.reason);
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return { ok: true };
  });

  app.get('/api/media/:id', async (req, reply) => {
    const media = await getMedia(Number((req.params as any).id));
    if (!media) return reply.code(404).send({ error: 'Media not found' });
    const absPath = mediaAbsolutePath(media);
    if (!fs.existsSync(absPath)) return reply.code(404).send({ error: 'Media file missing' });
    return reply.type(media.mime).send(fs.createReadStream(absPath));
  });

  app.get('/api/payment-notifications', async () => listNotifications(50));

  app.get('/api/analytics', async (req) => {
    const query = z.object({
      range: z.coerce.number().int().min(1).max(365).default(30),
      channel: z.enum(['pos', 'whatsapp', 'ai']).optional(),
    }).parse(req.query ?? {});
    return getAnalytics(query.range, { channel: query.channel });
  });

  // ---- register: sales + cash ledger -----------------------------------------
  // Today's local date (business timezone) when no explicit day is given.
  const todayInBusinessTz = async () => {
    const { timezone } = await getSalesSettings();
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  };
  const dayQuery = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

  const salesChannel = z.enum(['pos', 'whatsapp', 'ai']);
  const dayChannelQuery = dayQuery.extend({ channel: salesChannel.optional() });

  app.get('/api/sales', async (req) => {
    const { day, channel } = dayChannelQuery.parse(req.query ?? {});
    return listSales(day ?? await todayInBusinessTz(), { channel });
  });

  app.get('/api/sales/day-summary', async (req) => {
    const { day, channel } = dayChannelQuery.parse(req.query ?? {});
    return getDaySummary(day ?? await todayInBusinessTz(), { channel });
  });

  app.post('/api/sales', async (req, reply) => {
    const body = z.object({
      items: z.array(z.object({
        productId: z.number().int().nullable().optional(),
        name: z.string().min(1),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        unitCost: z.number().nonnegative().nullable().optional(),
      })).min(1),
      paymentMethod: z.string().min(1),
      discount: z.number().nonnegative().optional(),
      note: z.string().optional(),
      contactId: z.number().int().nullable().optional(),
    }).parse(req.body);
    const sale = await createSale({ ...body, channel: 'pos' });
    return reply.code(201).send(sale);
  });

  // Assign products to a lineless WhatsApp/AI sale, so it finally moves stock.
  app.post('/api/sales/:id/items', async (req, reply) => {
    const body = z.object({
      items: z.array(z.object({
        productId: z.number().int().nullable().optional(),
        name: z.string().min(1),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        unitCost: z.number().nonnegative().nullable().optional(),
      })).min(1),
    }).parse(req.body);
    const res = await attachSaleItems(Number((req.params as any).id), body.items);
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  app.post('/api/sales/:id/void', async (req, reply) => {
    const res = await voidSale(Number((req.params as any).id));
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  app.delete('/api/sales/:id', async (req, reply) => {
    const res = await deleteSale(Number((req.params as any).id));
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  app.get('/api/cash-movements', async (req) => {
    const { day } = dayQuery.parse(req.query ?? {});
    return listCashMovements(day ?? await todayInBusinessTz());
  });

  app.post('/api/cash-movements', async (req, reply) => {
    const body = z.object({
      kind: z.enum(['expense', 'income', 'adjustment']),
      amount: z.number().positive(),
      method: z.string().optional(),
      category: z.string().optional(),
      note: z.string().optional(),
    }).parse(req.body);
    const row = await addCashMovement(body);
    return reply.code(201).send(row);
  });

  app.get('/api/cash/position', async (req) => {
    const { day } = dayQuery.parse(req.query ?? {});
    return getCashPosition(day ?? await todayInBusinessTz());
  });

  // The cash day. `suggestedOpening` is what to prefill the apertura with, so the
  // shopkeeper confirms a number instead of inventing one.
  app.get('/api/cash/session', async (req) => {
    const { day } = dayQuery.parse(req.query ?? {});
    const d = day ?? await todayInBusinessTz();
    return { day: d, session: await getCashSession(d), suggestedOpening: await suggestOpeningAmount(d) };
  });

  app.post('/api/cash/session/open', async (req, reply) => {
    const body = z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      amount: z.number().nonnegative(),
    }).parse(req.body ?? {});
    const res = await openCashDay({ day: body.day ?? await todayInBusinessTz(), amount: body.amount });
    if (!res.ok) return reply.code(400).send(res);
    return res.session;
  });

  app.post('/api/cash/session/close', async (req, reply) => {
    const body = z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      counted: z.number().nonnegative(),
      note: z.string().max(300).optional(),
    }).parse(req.body ?? {});
    const res = await closeCashDay({ day: body.day ?? await todayInBusinessTz(), counted: body.counted, note: body.note });
    if (!res.ok) return reply.code(400).send(res);
    return res.session;
  });

  app.post('/api/cash/session/reopen', async (req, reply) => {
    const { day } = dayQuery.parse(req.body ?? {});
    const res = await reopenCashDay(day ?? await todayInBusinessTz());
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  app.get('/api/sales/payment-methods', async () => (await getSalesSettings()).paymentMethods);

  // ---- daily digest (Cierre de día) ------------------------------------------
  app.get('/api/digest/preview', async () => composeDigest(await todayInBusinessTz()));

  app.post('/api/digest/send-now', async (_req, reply) => {
    const res = await sendDigestNow();
    return reply.send(res);
  });

  // ---- backups + data export -------------------------------------------------
  // Operator-level latest-backup status (no file paths leaked to tenants).
  app.get('/api/backups/latest', async () => {
    const b = await latestBackup();
    if (!b) return { configured: !!config.backupDir, latest: null };
    return { configured: !!config.backupDir, latest: { size_bytes: b.size_bytes, total_rows: b.total_rows, status: b.status, created_at: b.created_at } };
  });
  app.post('/api/backups/run', async (_req, reply) => reply.send(await runBackup()));

  // Per-business data export (self-serve). JSON bundle of the tenant's own rows.
  const EXPORT_TABLES = ['products', 'contacts', 'sales', 'cash_movements', 'charges',
    'stock_movements', 'stock_entries', 'cash_sessions'] as const;
  app.get('/api/export', async () => {
    const biz = currentBusinessId();
    const bundle: Record<string, any[]> = {};
    for (const t of EXPORT_TABLES) bundle[t] = await many(`SELECT * FROM ${t} WHERE business_id = $1 ORDER BY id`, [biz]);
    // Line-item tables have no business_id of their own — reach them through their parent.
    bundle.sale_items = await many(
      `SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.business_id = $1 ORDER BY si.id`, [biz]);
    bundle.stock_entry_items = await many(
      `SELECT i.* FROM stock_entry_items i JOIN stock_entries e ON e.id = i.entry_id WHERE e.business_id = $1 ORDER BY i.id`, [biz]);
    return { exportedAt: Date.now(), businessId: biz, ...bundle };
  });

  // One table as CSV (for a spreadsheet).
  app.get('/api/export.csv', async (req, reply) => {
    const { table } = z.object({ table: z.enum(EXPORT_TABLES) }).parse(req.query ?? {});
    const rows = await many(`SELECT * FROM ${table} WHERE business_id = $1 ORDER BY id`, [currentBusinessId()]);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r: any) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${table}.csv"`).send(csv);
  });

  // ---- web push ---------------------------------------------------------------
  app.get('/api/push/vapid', async () => ({ enabled: isPushConfigured(), publicKey: vapidPublicKey() }));

  app.post('/api/push/subscribe', async (req, reply) => {
    if (!isPushConfigured()) return reply.code(503).send({ error: 'Push not configured' });
    const body = z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }).parse(req.body);
    await saveSubscription(body);
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const body = z.object({ endpoint: z.string() }).parse(req.body ?? {});
    await removeSubscription(body.endpoint);
    return { ok: true };
  });

  // Native (Capacitor) push: register/unregister an FCM/APNs device token.
  app.post('/api/push/register-device', async (req) => {
    const body = z.object({ platform: z.enum(['ios', 'android']), token: z.string().min(1) }).parse(req.body);
    await saveDeviceToken(body.platform, body.token);
    return { ok: true };
  });

  app.post('/api/push/unregister-device', async (req) => {
    const body = z.object({ token: z.string() }).parse(req.body ?? {});
    await removeDeviceToken(body.token);
    return { ok: true };
  });

  // ---- payment-notification webhook (per-business secret, NOT dashboard token) ----
  app.post('/api/webhooks/payment', async (req, reply) => {
    // The webhook runs outside the auth hook, so resolve the tenant from the
    // secret: it's the business whose payments_webhook_secret matches.
    const provided = String(req.headers['x-wabos-secret'] ?? '');
    if (!provided) return reply.code(401).send({ error: 'Unauthorized' });
    const owner = await one<{ business_id: number }>(
      "SELECT business_id FROM settings WHERE key = 'payments_webhook_secret' AND value = $1 LIMIT 1", [provided]);
    if (!owner) return reply.code(401).send({ error: 'Unauthorized' });

    const body = z.object({
      provider: z.enum(['yape', 'plin', 'transfer', 'other']).nullable().optional(),
      amount: z.number().nullable().optional(),
      currency: z.string().default('PEN'),
      operation_number: z.string().nullable().optional(),
      sender_name: z.string().nullable().optional(),
      raw_text: z.string().nullable().optional(),
      received_at: z.number().int().nullable().optional(),
      external_id: z.string().min(1),
    }).parse(req.body);

    return runWithBusiness(owner.business_id, async () => {
      const inserted = await insertNotification({
        source: 'webhook',
        provider: body.provider ?? null,
        amount: body.amount ?? null,
        currency: body.currency,
        operationNumber: body.operation_number ?? null,
        senderName: body.sender_name ?? null,
        rawText: body.raw_text ?? null,
        receivedAt: body.received_at ?? null,
        externalId: body.external_id,
      });
      if (inserted) await rekickPendingReceipts(); // resolve any screenshot already waiting
      return { ok: true, duplicate: inserted === null };
    });
  });

  // ---- billing webhook (provider-neutral; signature-verified inside the module) ----
  app.post('/api/webhooks/billing', async (req, reply) => {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) return reply.code(400).send({ error: 'Missing body' });
    try {
      await handleWebhook(rawBody, req.headers as Record<string, string | undefined>);
      return { received: true };
    } catch (err: any) {
      if (err.code === 'BILLING_DISABLED') return reply.code(503).send({ error: err.message });
      logger.warn({ err }, 'billing webhook rejected');
      return reply.code(400).send({ error: 'Webhook error' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.errors.map((e) => e.message).join(', ') });
    }
    if ((err as any).code === 'PLAN_LIMIT') {
      return reply.code(402).send({ error: (err as Error).message });
    }
    logger.error({ err }, 'API error');
    return reply.code(500).send({ error: err instanceof Error ? err.message : 'Internal error' });
  });

  return app;
}

export async function startApi() {
  const app = await buildApi();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`API listening on http://localhost:${config.port}`);
  return app;
}
