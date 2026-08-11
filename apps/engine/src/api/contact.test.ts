import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The public contact endpoint is unauthenticated, so the things worth pinning
// down are: it does not weaken auth elsewhere, it validates, it rate-limits, and
// — most importantly — the recipient can never be influenced by the request.

interface MailOpts { to: string; subject: string; text: string; html?: string; replyTo?: string }
const sendMail = vi.fn(async (_opts: MailOpts) => {});

vi.mock('../modules/mailer.js', () => ({
  sendMail,
  isEmailEnabled: () => true,
  sendPasswordReset: async () => {},
}));

let schema: string;
let db: typeof import('../db/index.js');
let app: FastifyInstance;

const valid = {
  nombre: 'Brian Sanchez',
  email: 'cliente@ejemplo.com',
  mensaje: 'Quisiera una demo para mi minimarket en Surco.',
};

/** Distinct IP per test so the per-IP limiter doesn't bleed across cases. */
const from = (ip: string) => ({ 'x-forwarded-for': ip });

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  const { buildApi } = await import('./server.js');
  app = await buildApi();
});

afterAll(async () => {
  await app.close();
  await db.pool.end();
  await dropTempSchema(schema);
});

describe('POST /api/public/contact', () => {
  it('accepts a valid submission and always mails the hardcoded address', async () => {
    sendMail.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/api/public/contact', headers: from('10.0.0.1'), payload: valid,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, delivered: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'support@wabos.co', replyTo: valid.email });
  });

  it('ignores any attempt to redirect the mail somewhere else', async () => {
    sendMail.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/contact',
      headers: from('10.0.0.2'),
      payload: { ...valid, to: 'atacante@evil.com', replyTo: 'atacante@evil.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(sendMail.mock.calls[0][0].to).toBe('support@wabos.co');
  });

  it('escapes HTML so a submission cannot inject markup into the email', async () => {
    sendMail.mockClear();
    await app.inject({
      method: 'POST',
      url: '/api/public/contact',
      headers: from('10.0.0.3'),
      payload: { ...valid, nombre: '<script>alert(1)</script>' },
    });

    const html = sendMail.mock.calls[0][0].html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects a body that fails validation', async () => {
    sendMail.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/contact',
      headers: from('10.0.0.4'),
      payload: { nombre: 'x', email: 'no-es-correo', mensaje: 'corto' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rate-limits a single IP after 5 submissions in the window', async () => {
    const ip = from('10.0.0.5');
    for (let i = 0; i < 5; i++) {
      const ok = await app.inject({ method: 'POST', url: '/api/public/contact', headers: ip, payload: valid });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/public/contact', headers: ip, payload: valid });
    expect(blocked.statusCode).toBe(429);
  });
});

describe('the /api/public/ exemption does not weaken the rest of the API', () => {
  it('still rejects an authenticated route without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(401);
  });

  it('does not exempt paths that merely start similarly', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/publicidad' });
    expect(res.statusCode).toBe(401);
  });
});
