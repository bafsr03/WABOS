import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { one, many, none, setSetting } from '../db/index.js';
import { config } from '../config.js';
import { runWithBusiness } from '../context.js';
import { purgeBusiness } from './reset.js';

// Google's public signing keys (cached by jose). Used to verify the ID token the
// "Sign in with Google" button returns.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Built-in email/password auth. Passwords are argon2-hashed; sessions are stateless
// JWTs (30-day) the dashboard stores where the old static token lived. A user owns
// one or more businesses through memberships; v1 issues a single owner membership.

const secret = new TextEncoder().encode(config.jwtSecret);

export interface User { id: number; email: string }
export interface BusinessLite { id: number; name: string; plan_tier: string; role: string }

async function issueToken(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

// Returns the user id encoded in a valid token, or null if missing/invalid/expired.
export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const uid = payload.uid;
    return typeof uid === 'number' ? uid : null;
  } catch {
    return null;
  }
}

// Give a freshly-created business its starter config + default agent, scoped to
// that business. Mirrors what initDb()'s seedDefaultAgents does for existing rows.
export async function provisionBusiness(businessId: number, name: string): Promise<void> {
  await runWithBusiness(businessId, async () => {
    await setSetting('business_name', name);
    await setSetting('ai_enabled', '1');
    // plan_tier lives on the businesses row (source of truth for entitlements,
    // synced by the billing webhook); new tenants start 'free' via the INSERT.

    await none(
      `INSERT INTO agents (business_id, name, slug, description, is_default, enabled)
       VALUES ($1, 'Asistente', 'default', 'Agente general: atiende cualquier consulta del cliente por defecto.', 1, 1)
       ON CONFLICT (business_id, slug) DO NOTHING`,
      [businessId],
    );
  });
}

export async function registerUser(email: string, password: string, businessName: string): Promise<{ token: string; user: User; business: BusinessLite }> {
  const normalized = email.trim().toLowerCase();
  if (await one('SELECT id FROM users WHERE lower(email) = $1', [normalized])) {
    throw Object.assign(new Error('Ese correo ya está registrado'), { code: 'EMAIL_TAKEN' });
  }
  const hash = await argon2.hash(password);
  const user = (await one<User>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [normalized, hash]))!;
  const business = (await one<{ id: number; name: string; plan_tier: string }>(
    "INSERT INTO businesses (name, plan_tier) VALUES ($1, 'free') RETURNING id, name, plan_tier", [businessName],
  ))!;
  await none('INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, $3)', [user.id, business.id, 'owner']);
  await provisionBusiness(business.id, businessName);
  return { token: await issueToken(user.id), user, business: { ...business, role: 'owner' } };
}

// Create a new workspace owned by an existing user (the switcher's "+ Nuevo
// espacio"). Same business+membership+provision as registration, minus the user.
export async function createBusinessForUser(userId: number, name: string): Promise<BusinessLite> {
  const business = (await one<{ id: number; name: string; plan_tier: string }>(
    "INSERT INTO businesses (name, plan_tier) VALUES ($1, 'free') RETURNING id, name, plan_tier", [name],
  ))!;
  await none('INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, $3)', [userId, business.id, 'owner']);
  await provisionBusiness(business.id, name);
  return { ...business, role: 'owner' };
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: User }> {
  const row = await one<{ id: number; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE lower(email) = $1', [email.trim().toLowerCase()],
  );
  if (!row || !(await argon2.verify(row.password_hash, password))) {
    throw Object.assign(new Error('Correo o contraseña incorrectos'), { code: 'INVALID_CREDENTIALS' });
  }
  return { token: await issueToken(row.id), user: { id: row.id, email: row.email } };
}

// Verify a Google ID token, then log the user in (or create the account +
// business on first sign-in, same as registerUser). The email is the identity —
// a Google user with the same email as a password account signs into it.
export async function loginWithGoogle(credential: string): Promise<{ token: string; user: User; business?: BusinessLite }> {
  if (!config.googleClientId) {
    throw Object.assign(new Error('El inicio con Google no está configurado'), { code: 'GOOGLE_NOT_CONFIGURED' });
  }
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.googleClientId,
    }) as any);
  } catch {
    throw Object.assign(new Error('Token de Google inválido'), { code: 'INVALID_CREDENTIALS' });
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!email || payload.email_verified === false) {
    throw Object.assign(new Error('Google no verificó tu correo'), { code: 'INVALID_CREDENTIALS' });
  }

  const existing = await one<User>('SELECT id, email FROM users WHERE lower(email) = $1', [email]);
  if (existing) return { token: await issueToken(existing.id), user: existing };

  // First Google sign-in → create the account + a fresh workspace (no password;
  // a random hash keeps the column non-null).
  const hash = await argon2.hash(randomUUID());
  const user = (await one<User>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hash]))!;
  const businessName = String(payload.name ?? email.split('@')[0]);
  const business = (await one<{ id: number; name: string; plan_tier: string }>(
    "INSERT INTO businesses (name, plan_tier) VALUES ($1, 'free') RETURNING id, name, plan_tier", [businessName],
  ))!;
  await none('INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, $3)', [user.id, business.id, 'owner']);
  await provisionBusiness(business.id, businessName);
  return { token: await issueToken(user.id), user, business: { ...business, role: 'owner' } };
}

export async function getUser(userId: number): Promise<User | undefined> {
  return one<User>('SELECT id, email FROM users WHERE id = $1', [userId]);
}

// Permanently delete a user and every business they own — all data, agents,
// settings, memberships, and the business rows. Returns the purged business ids
// so the caller can also tear down their WhatsApp sockets. This is the
// data-deletion path (GDPR-style "delete my account").
export async function deleteAccount(userId: number): Promise<number[]> {
  const memberships = await many<{ business_id: number }>('SELECT business_id FROM memberships WHERE user_id = $1', [userId]);
  const purged: number[] = [];
  for (const m of memberships) {
    await runWithBusiness(m.business_id, () => purgeBusiness());
    purged.push(m.business_id);
  }
  await none('DELETE FROM users WHERE id = $1', [userId]); // any remaining memberships cascade
  return purged;
}

export async function listUserBusinesses(userId: number): Promise<BusinessLite[]> {
  return many<BusinessLite>(`
    SELECT b.id, b.name, b.plan_tier, m.role
    FROM memberships m JOIN businesses b ON b.id = m.business_id
    WHERE m.user_id = $1 ORDER BY m.created_at
  `, [userId]);
}

// Resolve which business a request acts on. With one membership it's implicit;
// a requested id (X-Business-Id header) must belong to the user.
export async function resolveBusinessForUser(userId: number, requestedId?: number): Promise<number | null> {
  if (requestedId) {
    const ok = await one('SELECT 1 FROM memberships WHERE user_id = $1 AND business_id = $2', [userId, requestedId]);
    return ok ? requestedId : null;
  }
  const row = await one<{ business_id: number }>('SELECT business_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1', [userId]);
  return row?.business_id ?? null;
}
