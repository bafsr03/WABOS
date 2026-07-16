import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The data-layer split is the exact logic behind the change-number flow that once
// wiped live business data. These tests lock down what survives vs. what clears.
// Everything runs as the default business (id 1).

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('./store.js');
let reset: typeof import('./reset.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('./store.js');
  reset = await import('./reset.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  // Reset to a clean brand+connection state before each case.
  await reset.wipeAllData();
});

async function seed() {
  const contact = await store.upsertContactByJid('51999@s.whatsapp.net', 'Ana'); // brand/CRM
  const convo = await store.getOrCreateConversation(contact.id);                 // connection
  await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'hola' }); // connection
  await db.none("INSERT INTO products (name, price, currency) VALUES ('Polo', 50, 'PEN')"); // brand
  await db.none("INSERT INTO faqs (question, answer) VALUES ('Horario?', '9-6')");          // brand
  await db.none("INSERT INTO tags (name) VALUES ('interesado')");                            // brand/CRM
  await db.none("INSERT INTO broadcasts (name, message, total) VALUES ('promo', 'hola', 1)"); // connection
  await db.none("INSERT INTO jobs (type, payload) VALUES ('broadcast.send', '{}')");          // connection
  await db.setSetting('business_name', 'STAND 120'); // brand setting — must survive
  await db.setSetting('history_full_sync', '1');     // connection-transient — must reset to '0'
  return { contactId: contact.id };
}

const count = async (table: string) =>
  (await db.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`))!.n;

describe('clearConnectionData', () => {
  it('clears connection tables but keeps brand + CRM, and resets the full-sync flag', async () => {
    await seed();
    await reset.clearConnectionData();

    expect(await count('messages')).toBe(0);
    expect(await count('conversations')).toBe(0);
    expect(await count('broadcasts')).toBe(0);
    expect(await count('jobs')).toBe(0);

    expect(await count('products')).toBe(1);
    expect(await count('faqs')).toBe(1);
    expect(await count('contacts')).toBe(1);
    expect(await count('tags')).toBe(1);
    expect(await db.getSetting('business_name', '')).toBe('STAND 120');

    expect(await db.getSetting('history_full_sync', '')).toBe('0');
  });
});

describe('reconcileLinkedNumber', () => {
  it('sets account_phone on first link without clearing', async () => {
    await db.setSetting('account_phone', '');
    await db.setSetting('business_name', 'STAND 120');
    await reset.reconcileLinkedNumber('51111');
    expect(await db.getSetting('account_phone', '')).toBe('51111');
    expect(await db.getSetting('business_name', '')).toBe('STAND 120'); // untouched
  });

  it('is a no-op when the same number reconnects (keeps connection data)', async () => {
    await db.setSetting('account_phone', '51111');
    const convo = await store.getOrCreateConversation((await store.upsertContactByJid('51222@s.whatsapp.net')).id);
    await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'again' });
    const before = await count('messages');

    await reset.reconcileLinkedNumber('51111');

    expect(await count('messages')).toBe(before); // nothing cleared
    expect(await db.getSetting('account_phone', '')).toBe('51111');
  });

  it('clears the connection layer when a different number links', async () => {
    await db.setSetting('account_phone', '51111');
    const convo = await store.getOrCreateConversation((await store.upsertContactByJid('51222@s.whatsapp.net')).id);
    await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'again' });
    expect(await count('messages')).toBeGreaterThan(0);

    await reset.reconcileLinkedNumber('51999'); // different number

    expect(await count('messages')).toBe(0);            // connection cleared
    expect(await db.getSetting('account_phone', '')).toBe('51999'); // anchor updated
    expect(await count('contacts')).toBeGreaterThan(0); // CRM kept
  });
});
