import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Knowledge base: collections + documents, business-scoped, with the two AI
// access paths — pinned summaries for the prompt and keyword search for tools.

let schema: string;
let db: typeof import('../db/index.js');
let kb: typeof import('./knowledge.js');
let ctx: typeof import('../context.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  kb = await import('./knowledge.js');
  ctx = await import('../context.js');
  await db.none("INSERT INTO businesses (id, name) VALUES (2, 'Biz Two')");
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM knowledge_documents');
  await db.none('DELETE FROM knowledge_collections');
});

describe('collections + documents CRUD', () => {
  it('creates a collection and files a document under it', async () => {
    const col = await kb.createCollection({ name: 'Políticas' });
    const doc = await kb.createDocument({
      title: 'Envíos', kind: 'policy', collection_id: col.id,
      summary: 'Delivery local 12–20h; provincia por agencia.',
      content: 'Hacemos delivery en Lima de 12 a 20h. A provincia enviamos por Shalom/Olva.',
      pinned: true,
    });
    expect(doc.kind).toBe('policy');
    expect(await kb.listDocuments(col.id)).toHaveLength(1);
  });

  it('keeps documents when their collection is deleted (collection_id → null)', async () => {
    const col = await kb.createCollection({ name: 'Temp' });
    const doc = await kb.createDocument({ title: 'Guía', content: 'algo', collection_id: col.id });
    await kb.deleteCollection(col.id);
    expect((await kb.getDocument(doc.id))!.collection_id).toBeNull();
  });
});

describe('retrieval', () => {
  it('exposes only pinned+active docs with a summary to the prompt', async () => {
    await kb.createDocument({ title: 'Envíos', summary: 'Delivery y provincia', content: 'x', pinned: true });
    await kb.createDocument({ title: 'Interno', summary: 'no mostrar', content: 'y', pinned: false });
    await kb.createDocument({ title: 'Sin resumen', summary: '', content: 'z', pinned: true });
    await kb.createDocument({ title: 'Inactivo', summary: 'oculto', content: 'w', pinned: true, active: false });
    const pinned = await kb.getPinnedForPrompt();
    expect(pinned.map((d) => d.title)).toEqual(['Envíos']);
  });

  it('searches title/summary/content/keywords of active docs', async () => {
    await kb.createDocument({ title: 'Devoluciones', summary: '', content: 'Aceptamos cambios dentro de 7 días.', keywords: 'reembolso garantía' });
    await kb.createDocument({ title: 'Otro', content: 'nada que ver' });

    expect((await kb.searchKnowledge('cambios')).map((d) => d.title)).toEqual(['Devoluciones']);
    expect((await kb.searchKnowledge('reembolso')).map((d) => d.title)).toEqual(['Devoluciones']);
    expect(await kb.searchKnowledge('')).toEqual([]);
  });
});

describe('business scoping', () => {
  it('never leaks documents across businesses', async () => {
    await ctx.runWithBusiness(1, () => kb.createDocument({ title: 'B1 doc', content: 'a', pinned: true, summary: 's' }));
    await ctx.runWithBusiness(2, () => kb.createDocument({ title: 'B2 doc', content: 'b', pinned: true, summary: 's' }));

    expect((await ctx.runWithBusiness(1, () => kb.listDocuments())).map((d) => d.title)).toEqual(['B1 doc']);
    expect((await ctx.runWithBusiness(2, () => kb.searchKnowledge('doc'))).map((d) => d.title)).toEqual(['B2 doc']);
    expect(await ctx.runWithBusiness(1, () => kb.getPinnedForPrompt())).toHaveLength(1);
  });
});
