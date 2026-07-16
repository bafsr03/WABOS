import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Smoke tests over the real Fastify app via inject() — no port binding, temp schema.

let schema: string;
let db: typeof import('../db/index.js');
let app: FastifyInstance;
let auth: { authorization: string };

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  const { config } = await import('../config.js');
  auth = { authorization: `Bearer ${config.dashboardToken}` };
  const { buildApi } = await import('./server.js');
  app = await buildApi();
});

afterAll(async () => {
  await app.close();
  await db.pool.end();
  await dropTempSchema(schema);
});

describe('auth', () => {
  it('rejects /api requests without a valid bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(401);
  });
});

describe('products CRUD', () => {
  it('starts empty, then returns a created product', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/products', headers: auth });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/products',
      headers: auth,
      payload: { name: 'Polo azul', price: 59.9, currency: 'PEN' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Polo azul', price: 59.9, currency: 'PEN' });

    const list = await app.inject({ method: 'GET', url: '/api/products', headers: auth });
    expect(list.json()).toHaveLength(1);
  });

  it('validates the request body (400 on bad input)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/products',
      headers: auth,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('settings', () => {
  it('exposes the computed _aiAvailable flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('_aiAvailable', false);
  });
});
