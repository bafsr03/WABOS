import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus, type WabosEvent } from '../events.js';
import { db, getAllSettings, setSetting } from '../db/index.js';
import { getWaState, logoutWhatsApp } from '../wa/connection.js';
import { sendText } from '../wa/outbound.js';
import { isAiAvailable } from '../ai/employee.js';
import {
  listConversations, listMessages, getConversation,
  setConversationMode, markConversationRead, upsertContactByJid,
} from '../modules/store.js';
import { createBroadcast, getBroadcast, listBroadcasts } from '../modules/broadcasts.js';
import {
  createCharge, getCharge, listCharges, setChargeStatus,
  listReceipts, getMedia,
} from '../modules/charges.js';
import { approveReceipt, rejectReceipt, rekickPendingReceipts } from '../workers/receipt-verifier.js';
import { insertNotification, listNotifications } from '../modules/payment-notifications.js';
import { getPaymentSettings } from '../modules/charges.js';
import { mediaAbsolutePath } from '../wa/media.js';
import fs from 'node:fs';

export async function startApi() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  // ---- auth ----------------------------------------------------------------
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    // Webhooks authenticate with their own per-business secret, not the
    // dashboard token (the merchant's phone/app posts to them).
    if (req.url.startsWith('/api/webhooks/')) return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token !== config.dashboardToken) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ---- realtime ------------------------------------------------------------
  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('token') !== config.dashboardToken) {
      socket.close(4001, 'Unauthorized');
      return;
    }
    const forward = (event: WabosEvent) => {
      try { socket.send(JSON.stringify(event)); } catch { /* client gone */ }
    };
    bus.on('event', forward);
    socket.on('close', () => bus.off('event', forward));
    const wa = getWaState();
    forward({ type: 'wa.status', status: wa.status, qr: wa.qr, me: wa.me });
  });

  // ---- whatsapp connection -------------------------------------------------
  app.get('/api/status', async () => {
    const wa = getWaState();
    return {
      ...wa,
      qrDataUrl: wa.qr ? await QRCode.toDataURL(wa.qr, { margin: 1, width: 320 }) : null,
      aiAvailable: isAiAvailable(),
    };
  });

  app.post('/api/logout', async () => {
    await logoutWhatsApp();
    return { ok: true };
  });

  // ---- conversations & messages ---------------------------------------------
  app.get('/api/conversations', async () => listConversations());

  app.get('/api/conversations/:id/messages', async (req) => {
    const id = Number((req.params as any).id);
    return { conversation: getConversation(id), messages: listMessages(id, 200) };
  });

  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    if (!getConversation(id)) return reply.code(404).send({ error: 'Conversation not found' });
    // A manual reply means a human is handling this thread now
    setConversationMode(id, 'human');
    const ok = await sendText({ conversationId: id, text: body.text, humanized: false });
    return { ok };
  });

  app.post('/api/conversations/:id/mode', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({ mode: z.enum(['ai', 'human']) }).parse(req.body);
    setConversationMode(id, body.mode);
    return { ok: true };
  });

  app.post('/api/conversations/:id/read', async (req) => {
    markConversationRead(Number((req.params as any).id));
    return { ok: true };
  });

  // ---- contacts & tags -------------------------------------------------------
  app.get('/api/contacts', async () => {
    return db.prepare(`
      SELECT c.*, (
        SELECT json_group_array(json_object('id', t.id, 'name', t.name))
        FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = c.id
      ) AS tags,
      (SELECT id FROM conversations WHERE contact_id = c.id) AS conversation_id
      FROM contacts c ORDER BY c.created_at DESC
    `).all().map((row: any) => ({ ...row, tags: JSON.parse(row.tags) }));
  });

  app.post('/api/contacts', async (req, reply) => {
    const body = z.object({
      phone: z.string().min(6).regex(/^\+?\d+$/, 'Digits only, e.g. 51987654321'),
      name: z.string().default(''),
    }).parse(req.body);
    const phone = body.phone.replace('+', '');
    const contact = upsertContactByJid(`${phone}@s.whatsapp.net`, body.name || undefined);
    if (body.name) db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(body.name, contact.id);
    return reply.code(201).send(db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact.id));
  });

  app.patch('/api/contacts/:id', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({ name: z.string().optional(), notes: z.string().optional() }).parse(req.body);
    if (body.name !== undefined) db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(body.name, id);
    if (body.notes !== undefined) db.prepare('UPDATE contacts SET notes = ? WHERE id = ?').run(body.notes, id);
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  });

  app.delete('/api/contacts/:id', async (req) => {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(Number((req.params as any).id));
    return { ok: true };
  });

  app.get('/api/tags', async () => db.prepare('SELECT * FROM tags ORDER BY name').all());

  app.post('/api/contacts/:id/tags', async (req) => {
    const contactId = Number((req.params as any).id);
    const body = z.object({ tag: z.string().min(1) }).parse(req.body);
    const tag = body.tag.trim().toLowerCase();
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
    const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as { id: number };
    db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(contactId, tagRow.id);
    return { ok: true };
  });

  app.delete('/api/contacts/:id/tags/:tagId', async (req) => {
    const { id, tagId } = req.params as any;
    db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?').run(Number(id), Number(tagId));
    return { ok: true };
  });

  // ---- catalog ----------------------------------------------------------------
  app.get('/api/products', async () => db.prepare('SELECT * FROM products ORDER BY created_at DESC').all());

  app.post('/api/products', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().default(''),
      price: z.number().nonnegative(),
      currency: z.string().default('PEN'),
    }).parse(req.body);
    const info = db.prepare('INSERT INTO products (name, description, price, currency) VALUES (?, ?, ?, ?)')
      .run(body.name, body.description, body.price, body.currency);
    return reply.code(201).send(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  });

  app.patch('/api/products/:id', async (req) => {
    const id = Number((req.params as any).id);
    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.number().nonnegative().optional(),
      currency: z.string().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!current) return { error: 'Not found' };
    db.prepare('UPDATE products SET name = ?, description = ?, price = ?, currency = ?, active = ? WHERE id = ?')
      .run(
        body.name ?? current.name,
        body.description ?? current.description,
        body.price ?? current.price,
        body.currency ?? current.currency,
        body.active === undefined ? current.active : body.active ? 1 : 0,
        id,
      );
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  });

  app.delete('/api/products/:id', async (req) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(Number((req.params as any).id));
    return { ok: true };
  });

  // ---- FAQs ---------------------------------------------------------------------
  app.get('/api/faqs', async () => db.prepare('SELECT * FROM faqs ORDER BY id').all());

  app.post('/api/faqs', async (req, reply) => {
    const body = z.object({ question: z.string().min(1), answer: z.string().min(1) }).parse(req.body);
    const info = db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)').run(body.question, body.answer);
    return reply.code(201).send(db.prepare('SELECT * FROM faqs WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/api/faqs/:id', async (req) => {
    db.prepare('DELETE FROM faqs WHERE id = ?').run(Number((req.params as any).id));
    return { ok: true };
  });

  // ---- settings -------------------------------------------------------------------
  app.get('/api/settings', async () => ({ ...getAllSettings(), _aiAvailable: isAiAvailable() }));

  app.put('/api/settings', async (req) => {
    const body = z.record(z.string()).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith('_')) continue;
      setSetting(key, value);
    }
    return getAllSettings();
  });

  // ---- broadcasts -------------------------------------------------------------------
  app.get('/api/broadcasts', async () => listBroadcasts());

  app.get('/api/broadcasts/:id', async (req) => getBroadcast(Number((req.params as any).id)));

  app.post('/api/broadcasts', async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      message: z.string().min(1),
      tagId: z.number().nullable().optional(),
    }).parse(req.body);
    if (getWaState().status !== 'connected') {
      return reply.code(409).send({ error: 'WhatsApp is not connected' });
    }
    try {
      return reply.code(201).send(createBroadcast({ name: body.name, message: body.message, tagId: body.tagId ?? null }));
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
    if (!db.prepare('SELECT id FROM contacts WHERE id = ?').get(body.contactId)) {
      return reply.code(404).send({ error: 'Contact not found' });
    }
    return reply.code(201).send(createCharge({
      contactId: body.contactId,
      amount: body.amount,
      currency: body.currency,
      concept: body.concept,
      dueAt: body.dueAt ?? null,
    }));
  });

  app.post('/api/charges/:id/cancel', async (req, reply) => {
    const id = Number((req.params as any).id);
    const charge = getCharge(id);
    if (!charge) return reply.code(404).send({ error: 'Charge not found' });
    if (charge.status === 'paid') return reply.code(409).send({ error: 'Charge is already paid' });
    if (charge.status !== 'cancelled') setChargeStatus(id, 'cancelled');
    return { ok: true };
  });

  app.get('/api/receipts', async (req) => {
    const query = z.object({
      outcome: z.enum(['pending', 'auto_verified', 'review', 'rejected', 'not_receipt', 'manual_verified', 'manual_rejected']).optional(),
    }).parse(req.query ?? {});
    return listReceipts(query.outcome).map((r: any) => ({ ...r, reasons: JSON.parse(r.reasons) }));
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
    const media = getMedia(Number((req.params as any).id));
    if (!media) return reply.code(404).send({ error: 'Media not found' });
    const absPath = mediaAbsolutePath(media);
    if (!fs.existsSync(absPath)) return reply.code(404).send({ error: 'Media file missing' });
    return reply.type(media.mime).send(fs.createReadStream(absPath));
  });

  app.get('/api/payment-notifications', async () => listNotifications(50));

  // ---- payment-notification webhook (per-business secret, NOT dashboard token) ----
  app.post('/api/webhooks/payment', async (req, reply) => {
    const settings = getPaymentSettings();
    if (!settings.webhookSecret) return reply.code(503).send({ error: 'Webhook not configured' });
    if ((req.headers['x-wabos-secret'] ?? '') !== settings.webhookSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
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

    const inserted = insertNotification({
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
    if (inserted) rekickPendingReceipts(); // resolve any screenshot already waiting
    return { ok: true, duplicate: inserted === null };
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.errors.map((e) => e.message).join(', ') });
    }
    logger.error({ err }, 'API error');
    return reply.code(500).send({ error: err instanceof Error ? err.message : 'Internal error' });
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`API listening on http://localhost:${config.port}`);
  return app;
}
