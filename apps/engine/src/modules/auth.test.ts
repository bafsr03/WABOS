import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Built-in auth: register → JWT → scoped access. A registered tenant must never
// see the seeded business 1's data.

let schema: string;
let db: typeof import('../db/index.js');
let app: FastifyInstance;
let legacyAuth: { authorization: string };

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  const { config } = await import('../config.js');
  legacyAuth = { authorization: `Bearer ${config.dashboardToken}` };
  // Give business 1 a product so we can prove the new tenant can't see it.
  await db.none("INSERT INTO products (business_id, name, price) VALUES (1, 'B1 product', 10)");
  const { buildApi } = await import('../api/server.js');
  app = await buildApi();
});

afterAll(async () => { await app.close(); await db.pool.end(); await dropTempSchema(schema); });

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('register + login', () => {
  let token = '';

  it('registers a new user + business and returns a token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'nuevo@tienda.pe', password: 'supersecret', business_name: 'Tienda Nueva' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.business).toMatchObject({ name: 'Tienda Nueva', role: 'owner' });
    token = body.token;
  });

  it('rejects a duplicate email', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'nuevo@tienda.pe', password: 'supersecret', business_name: 'Otra' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a wrong password and accepts the right one', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nuevo@tienda.pe', password: 'wrong' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nuevo@tienda.pe', password: 'supersecret' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTruthy();
  });

  it('/api/auth/me returns the user and their business', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('nuevo@tienda.pe');
    expect(res.json().businesses).toHaveLength(1);
  });

  it('scopes data to the new tenant — cannot see business 1 products', async () => {
    // The new tenant starts with an empty catalog…
    const mine = await app.inject({ method: 'GET', url: '/api/products', headers: bearer(token) });
    expect(mine.json()).toEqual([]);
    // …even though business 1 (legacy token) has one.
    const b1 = await app.inject({ method: 'GET', url: '/api/products', headers: legacyAuth });
    expect(b1.json()).toHaveLength(1);

    // A product created by the new tenant is theirs alone.
    await app.inject({ method: 'POST', url: '/api/products', headers: bearer(token), payload: { name: 'Mío', price: 5 } });
    expect((await app.inject({ method: 'GET', url: '/api/products', headers: bearer(token) })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/products', headers: legacyAuth })).json()).toHaveLength(1);
  });

  it('rejects requests with no/invalid token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/products' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/products', headers: bearer('garbage') })).statusCode).toBe(401);
  });

  it('enforces the free-tier plan limit on agents (402)', async () => {
    // free trial = 1 agent, and the seeded default agent already fills it, so
    // any additional agent exceeds the cap.
    const capped = await app.inject({ method: 'POST', url: '/api/agents', headers: bearer(token), payload: { name: 'Ventas' } });
    expect(capped.statusCode).toBe(402);
  });
});

describe('account deletion', () => {
  it('purges the user + business + data, leaving other tenants intact', async () => {
    const reg = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'del@tienda.pe', password: 'supersecret', business_name: 'Para Borrar' },
    });
    const t = reg.json().token;
    const bid = reg.json().business.id;
    await app.inject({ method: 'POST', url: '/api/products', headers: bearer(t), payload: { name: 'X', price: 1 } });
    expect((await db.one('SELECT id FROM businesses WHERE id = $1', [bid]))).toBeTruthy();

    const del = await app.inject({ method: 'DELETE', url: '/api/account', headers: bearer(t) });
    expect(del.statusCode).toBe(200);

    // Business, its data, and the user are gone…
    expect(await db.one('SELECT id FROM businesses WHERE id = $1', [bid])).toBeUndefined();
    expect((await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM products WHERE business_id = $1', [bid]))!.n).toBe(0);
    expect(await db.one('SELECT id FROM users WHERE lower(email) = $1', ['del@tienda.pe'])).toBeUndefined();
    // …the orphaned token can no longer resolve a business (403)…
    expect((await app.inject({ method: 'GET', url: '/api/products', headers: bearer(t) })).statusCode).toBe(403);
    // …and business 1 is untouched.
    expect(await db.one('SELECT id FROM businesses WHERE id = 1')).toBeTruthy();
  });
});

describe('password reset', () => {
  it('resets the password with a valid token and enforces single use', async () => {
    const auth = await import('./auth.js');
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'reset@tienda.pe', password: 'oldpassword', business_name: 'Reset Co' } });

    // Unknown email → no token (but the HTTP endpoint still 200s, tested below).
    expect(await auth.requestPasswordReset('nobody@nowhere.pe')).toBeNull();

    const req = await auth.requestPasswordReset('reset@tienda.pe');
    expect(req?.token).toBeTruthy();

    // Wrong token is rejected; the real token works once.
    expect(await auth.resetPassword('deadbeef', 'newpassword')).toBe(false);
    expect(await auth.resetPassword(req!.token, 'newpassword')).toBe(true);
    expect(await auth.resetPassword(req!.token, 'again1234')).toBe(false); // already used

    // New password logs in; old one no longer does.
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'reset@tienda.pe', password: 'newpassword' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'reset@tienda.pe', password: 'oldpassword' } })).statusCode).toBe(401);
  });

  it('the forgot endpoint always 200s (never reveals whether the email exists)', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'reset@tienda.pe' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'ghost@nowhere.pe' } })).statusCode).toBe(200);
  });

  it('rejects an invalid/expired reset token over HTTP (400)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: 'not-a-real-token', password: 'whatever8' } });
    expect(res.statusCode).toBe(400);
  });
});
