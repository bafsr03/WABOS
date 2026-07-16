import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Multi-agent: every business gets a default agent, conversations resolve to it
// unless reassigned, and route_to_agent reassigns the conversation in-context.

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('./store.js');
let agents: typeof import('./agents.js');
let tools: typeof import('../ai/tools.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('./store.js');
  agents = await import('./agents.js');
  tools = await import('../ai/tools.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM conversations');
  await db.none('DELETE FROM contacts');
  await db.none('DELETE FROM agents WHERE is_default = 0');
});

describe('default agent', () => {
  it('is seeded for business 1 by initDb()', async () => {
    const def = await agents.getDefaultAgent();
    expect(def).toBeTruthy();
    expect(def!.is_default).toBe(1);
    expect(def!.slug).toBe('default');
  });

  it('cannot be deleted', async () => {
    const def = (await agents.getDefaultAgent())!;
    expect(await agents.deleteAgent(def.id)).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('conversation → agent resolution', () => {
  it('falls back to the default agent, then honors an explicit assignment', async () => {
    const contact = await store.upsertContactByJid('5111@s.whatsapp.net', 'Ana');
    const convo = await store.getOrCreateConversation(contact.id);

    expect((await agents.resolveAgentForConversation(convo.id))!.slug).toBe('default');

    const support = await agents.createAgent({ name: 'Soporte', description: 'reclamos y envíos' });
    await agents.setConversationAgent(convo.id, support.id);
    expect((await agents.resolveAgentForConversation(convo.id))!.id).toBe(support.id);

    await agents.updateAgent(support.id, { enabled: false });
    expect((await agents.resolveAgentForConversation(convo.id))!.slug).toBe('default');
  });

  it('generates unique slugs from names', async () => {
    const a = await agents.createAgent({ name: 'Ventas Perú' });
    const b = await agents.createAgent({ name: 'Ventas Perú' });
    expect(a.slug).toBe('ventas-peru');
    expect(b.slug).toBe('ventas-peru-2');
  });
});

describe('route_to_agent tool', () => {
  it('reassigns the conversation to the named sibling agent', async () => {
    const contact = await store.upsertContactByJid('5122@s.whatsapp.net', 'Bob');
    const convo = await store.getOrCreateConversation(contact.id);
    const def = (await agents.getDefaultAgent())!;
    const support = await agents.createAgent({ name: 'Soporte', description: 'reclamos y envíos' });

    const routable = await agents.getRoutableAgents(def.id);
    const defs = tools.buildToolDefinitions(routable);
    expect(defs.some((t) => t.name === 'route_to_agent')).toBe(true);

    const ctx = {
      conversation: { ...convo, ...contact, id: convo.id, contact_id: contact.id } as any,
      handedOff: false,
      routable,
      routedToAgentId: null as number | null,
    };
    const out = await tools.executeTool('route_to_agent', { agent: support.slug }, ctx);
    expect(out).toContain('Soporte');
    expect(ctx.routedToAgentId).toBe(support.id);
    expect((await agents.resolveAgentForConversation(convo.id))!.id).toBe(support.id);
  });

  it('rejects an unknown target slug without reassigning', async () => {
    const contact = await store.upsertContactByJid('5133@s.whatsapp.net', 'Cid');
    const convo = await store.getOrCreateConversation(contact.id);
    const def = (await agents.getDefaultAgent())!;
    const ctx = {
      conversation: { ...convo, ...contact, id: convo.id, contact_id: contact.id } as any,
      handedOff: false,
      routable: await agents.getRoutableAgents(def.id),
      routedToAgentId: null as number | null,
    };
    const out = await tools.executeTool('route_to_agent', { agent: 'nope' }, ctx);
    expect(out).toContain('No agent');
    expect(ctx.routedToAgentId).toBeNull();
  });
});
