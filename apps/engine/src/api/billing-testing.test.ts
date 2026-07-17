import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Covers the billing/metering status surface, multi-workspace creation + scoping,
// and the agent-testing flow — all via inject() against the real Fastify app.

let schema: string;
let db: typeof import('../db/index.js');
let app: FastifyInstance;
let legacy: { authorization: string };

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  const { config } = await import('../config.js');
  legacy = { authorization: `Bearer ${config.dashboardToken}` };
  const { buildApi } = await import('./server.js');
  app = await buildApi();
});

afterAll(async () => {
  await app.close();
  await db.pool.end();
  await dropTempSchema(schema);
});

describe('billing/metering status', () => {
  it('/api/status exposes plan tier, usage and billing availability', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status', headers: legacy });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Migration grandfathers the pilot (business 1) onto enterprise → unlimited.
    expect(body.planTier).toBe('enterprise');
    expect(body.usage).toMatchObject({ aiMessages: 0, aiMessagesLimit: null });
    expect(body).toHaveProperty('billingAvailable', false); // no billing keys in tests
  });

  it('checkout returns 503 when billing is not configured', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/billing/checkout', headers: legacy, payload: { tier: 'pro' } });
    expect(res.statusCode).toBe(503);
  });
});

describe('multi-workspace', () => {
  it('creates a second workspace and scopes data by X-Business-Id', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'owner@example.com', password: 'supersecret', business_name: 'Negocio A' } });
    expect(reg.statusCode).toBe(201);
    const { token, business: bizA } = reg.json();
    const bearer = { authorization: `Bearer ${token}` };

    const created = await app.inject({ method: 'POST', url: '/api/businesses', headers: { ...bearer, 'x-business-id': String(bizA.id) }, payload: { name: 'Negocio B' } });
    expect(created.statusCode).toBe(201);
    const bizB = created.json();

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer });
    expect(me.json().businesses).toHaveLength(2);

    // A product created under B must not be visible under A.
    await app.inject({ method: 'POST', url: '/api/products', headers: { ...bearer, 'x-business-id': String(bizB.id) }, payload: { name: 'Solo B', price: 10 } });
    const underA = await app.inject({ method: 'GET', url: '/api/products', headers: { ...bearer, 'x-business-id': String(bizA.id) } });
    expect(underA.json()).toHaveLength(0);
    const underB = await app.inject({ method: 'GET', url: '/api/products', headers: { ...bearer, 'x-business-id': String(bizB.id) } });
    expect(underB.json()).toHaveLength(1);
  });

  it('rejects a business the user is not a member of (403)', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'other@example.com', password: 'supersecret', business_name: 'Negocio C' } });
    const { token } = reg.json();
    const res = await app.inject({ method: 'GET', url: '/api/products', headers: { authorization: `Bearer ${token}`, 'x-business-id': '999999' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('agent testing', () => {
  it('starts a test conversation, keeps it out of contacts, and deletes cleanly', async () => {
    const agents = (await app.inject({ method: 'GET', url: '/api/agents', headers: legacy })).json();
    const agentId = agents.find((a: any) => a.is_default).id;

    const started = await app.inject({ method: 'POST', url: `/api/agents/${agentId}/test`, headers: legacy });
    expect(started.statusCode).toBe(201);
    const { conversationId } = started.json();
    expect(conversationId).toBeGreaterThan(0);

    // Visible in the Inbox (flagged is_test)…
    const convos = (await app.inject({ method: 'GET', url: '/api/conversations', headers: legacy })).json();
    const testConvo = convos.find((c: any) => c.id === conversationId);
    expect(testConvo?.is_test).toBe(1);
    // …but excluded from the CRM contacts list.
    const contacts = (await app.inject({ method: 'GET', url: '/api/contacts', headers: legacy })).json();
    expect(contacts.some((c: any) => c.jid?.endsWith('@wabos.test'))).toBe(false);

    // Sending a test message inserts the inbound turn (AI is unavailable in tests).
    const sent = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/test-messages`, headers: legacy, payload: { text: 'Hola, ¿tienen stock?' } });
    expect(sent.statusCode).toBe(200);
    const msgs = (await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages`, headers: legacy })).json();
    expect(msgs.messages.some((m: any) => m.direction === 'in' && m.text.includes('stock'))).toBe(true);

    // Cleanup cascades the conversation away.
    const del = await app.inject({ method: 'DELETE', url: `/api/conversations/${conversationId}/test`, headers: legacy });
    expect(del.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/api/conversations', headers: legacy })).json();
    expect(after.some((c: any) => c.id === conversationId)).toBe(false);
  });

  it('refuses test sends to a non-test conversation', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/conversations/999999/test-messages', headers: legacy, payload: { text: 'x' } });
    expect(res.statusCode).toBe(404);
  });
});
