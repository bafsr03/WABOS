import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The AI catalog search must hide out-of-stock items when a product tracks stock,
// and the create_charge tool must register a pending charge for the contact.

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('../modules/store.js');
let tools: typeof import('./tools.js');
let charges: typeof import('../modules/charges.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('../modules/store.js');
  tools = await import('./tools.js');
  charges = await import('../modules/charges.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM charges');
  await db.none('DELETE FROM products');
  await db.none('DELETE FROM conversations');
  await db.none('DELETE FROM contacts');
});

async function ctxFor(jid: string) {
  const contact = await store.upsertContactByJid(jid, 'Cliente');
  const conversation = await store.getOrCreateConversation(contact.id);
  return {
    conversation: { ...conversation, ...contact, contact_id: contact.id } as any,
    handedOff: false,
    routable: [],
    routedToAgentId: null,
  };
}

describe('search_catalog stock filter', () => {
  it('hides tracked out-of-stock items but keeps untracked and in-stock ones', async () => {
    const biz = db.pool; // marker; queries use default business 1
    await db.none(`INSERT INTO products (business_id, name, price, active, stock, track_stock) VALUES (1, 'Polo azul', 30, 1, 0, 1)`);   // out of stock
    await db.none(`INSERT INTO products (business_id, name, price, active, stock, track_stock) VALUES (1, 'Polo rojo', 30, 1, 5, 1)`);   // in stock
    await db.none(`INSERT INTO products (business_id, name, price, active, stock, track_stock) VALUES (1, 'Polo verde', 30, 1, NULL, 0)`); // untracked
    void biz;

    const ctx = await ctxFor('51999000001@s.whatsapp.net');
    const out = await tools.executeTool('search_catalog', { query: 'polo' }, ctx);
    expect(out).toContain('Polo rojo');
    expect(out).toContain('Polo verde');
    expect(out).not.toContain('Polo azul');
  });
});

describe('create_charge tool', () => {
  it('creates a pending charge for the conversation contact', async () => {
    const ctx = await ctxFor('51999000002@s.whatsapp.net');
    const out = await tools.executeTool('create_charge', { amount: 50, concept: '2 polos' }, ctx);
    expect(out).toContain('50.00');
    const pending = await charges.listPendingCharges(ctx.conversation.contact_id);
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe(50);
    expect(pending[0].created_by).toBe('ai');
  });

  it('rejects a non-positive amount without creating a charge', async () => {
    const ctx = await ctxFor('51999000003@s.whatsapp.net');
    const out = await tools.executeTool('create_charge', { amount: 0 }, ctx);
    expect(out.toLowerCase()).toContain('invalid');
    expect(await charges.listPendingCharges(ctx.conversation.contact_id)).toHaveLength(0);
  });
});
