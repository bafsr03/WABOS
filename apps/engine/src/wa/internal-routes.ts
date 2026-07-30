import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { runWithBusiness } from '../context.js';
import { sendText, sendOwnerText } from './outbound.js';
import {
  getWaState, logoutWhatsApp, changeNumber, pauseWhatsApp, reconnectWhatsApp, purgeConnection,
} from './connection.js';

// Internal service surface exposed by the whatsapp backend. The store backend
// calls these over the Docker network (never the public internet) with the
// shared STORE_INTERNAL_KEY. Registered only when this process runs the WhatsApp
// role. In ROLE=all these routes exist too but nothing calls them (the store code
// takes the local path).
export function registerInternalRoutes(app: FastifyInstance) {
  // Verify the peer key on every /internal/* request.
  app.addHook('onRequest', (req, reply, done) => {
    if (!req.url.startsWith('/internal/')) return done();
    if ((req.headers['x-internal-key'] ?? '') !== config.storeInternalKey) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    done();
  });

  app.post('/internal/send', async (req) => {
    const body = z.object({
      businessId: z.number().int(),
      conversationId: z.number().int(),
      text: z.string(),
      fromAi: z.boolean().default(false),
      humanized: z.boolean().default(true),
    }).parse(req.body);
    const ok = await runWithBusiness(body.businessId, () =>
      sendText({ conversationId: body.conversationId, text: body.text, fromAi: body.fromAi, humanized: body.humanized }));
    return { ok };
  });

  app.post('/internal/send-owner', async (req) => {
    const body = z.object({ businessId: z.number().int(), phone: z.string(), text: z.string() }).parse(req.body);
    const ok = await sendOwnerText(body.businessId, body.phone, body.text);
    return { ok };
  });

  app.post('/internal/wa/status', async (req) => {
    const { businessId } = z.object({ businessId: z.number().int() }).parse(req.body);
    return getWaState(businessId);
  });

  const bizBody = z.object({ businessId: z.number().int() });
  app.post('/internal/wa/logout', async (req) => {
    const { businessId } = bizBody.parse(req.body);
    await runWithBusiness(businessId, () => logoutWhatsApp(businessId));
    return { ok: true };
  });
  app.post('/internal/wa/change-number', async (req) => {
    const { businessId } = bizBody.parse(req.body);
    await runWithBusiness(businessId, () => changeNumber(businessId));
    return { ok: true };
  });
  app.post('/internal/wa/session-open', async (req) => {
    const { businessId } = bizBody.parse(req.body);
    await runWithBusiness(businessId, () => reconnectWhatsApp(businessId));
    return { ok: true };
  });
  app.post('/internal/wa/session-close', async (req) => {
    const { businessId } = bizBody.parse(req.body);
    await runWithBusiness(businessId, () => pauseWhatsApp(businessId));
    return { ok: true };
  });
  app.post('/internal/wa/purge', async (req) => {
    const { businessId } = bizBody.parse(req.body);
    await purgeConnection(businessId);
    return { ok: true };
  });
}
