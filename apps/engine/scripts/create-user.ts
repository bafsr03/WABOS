import argon2 from 'argon2';
import { one, none } from '../src/db/index.js';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

// Create an owner user for an existing business (default business 1 = STAND 120).
// Usage: pnpm --filter engine exec tsx scripts/create-user.ts <email> <password> [businessId=1]

const [email, password, businessIdArg] = process.argv.slice(2);
const businessId = Number(businessIdArg ?? 1);

if (!email || !password) {
  console.error('usage: tsx scripts/create-user.ts <email> <password> [businessId=1]');
  process.exit(1);
}

async function main() {
  await runMigrations();
  if (await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email])) {
    console.log(`user ${email} already exists — nothing to do`);
    await pool.end();
    return;
  }
  const hash = await argon2.hash(password);
  const user = (await one<{ id: number }>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, hash]))!;
  await none('INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [user.id, businessId, 'owner']);
  console.log(`created user ${email} → owner of business ${businessId}`);
  await pool.end();
}

main().catch(async (err) => { console.error(err); await pool.end().catch(() => {}); process.exit(1); });
