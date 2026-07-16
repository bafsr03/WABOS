import { one, many, none, tx, pool, sql } from './pool.js';
import { runMigrations } from './migrate.js';
import { currentBusinessId } from '../context.js';

// Async data layer over Postgres. Modules import the query helpers (one/many/
// none/tx) and the per-business settings accessors from here. The old
// synchronous better-sqlite3 `db` export is gone — every DB call now awaits.

export { one, many, none, tx, pool, sql };

// Give every business a default agent, seeded from its AI settings so single-
// agent behavior carries over. Idempotent (skips businesses that already have one).
async function seedDefaultAgents(): Promise<void> {
  const businesses = await many<{ id: number }>('SELECT id FROM businesses');
  for (const b of businesses) {
    const hasDefault = await one('SELECT 1 FROM agents WHERE business_id = $1 AND is_default = 1', [b.id]);
    if (hasDefault) continue;
    const read = async (key: string) =>
      (await one<{ value: string }>('SELECT value FROM settings WHERE business_id = $1 AND key = $2', [b.id, key]))?.value ?? '';
    await none(
      `INSERT INTO agents (business_id, name, slug, description, ai_tone, ai_instructions, communication_profile, is_default, enabled)
       VALUES ($1, 'Asistente', 'default', 'Agente general: atiende cualquier consulta del cliente por defecto.', $2, $3, $4, 1, 1)`,
      [b.id, await read('ai_tone'), await read('ai_instructions'), (await read('communication_profile')) || null],
    );
  }
}

// Fill a business's display fields from its own settings (idempotent; only fills
// blanks). Used after the sqlite→pg copy so business 1 shows its name/phone.
async function backfillBusinessesFromSettings(): Promise<void> {
  const businesses = await many<{ id: number }>('SELECT id FROM businesses');
  for (const b of businesses) {
    const read = async (key: string) =>
      (await one<{ value: string }>('SELECT value FROM settings WHERE business_id = $1 AND key = $2', [b.id, key]))?.value;
    const name = await read('business_name');
    const phone = await read('account_phone');
    if (name) await none("UPDATE businesses SET name = $1 WHERE id = $2 AND (name IS NULL OR name = '')", [name, b.id]);
    if (phone) await none('UPDATE businesses SET wa_phone = $1 WHERE id = $2 AND wa_phone IS NULL', [phone, b.id]);
  }
}

// Run migrations, then idempotent seeds. Must be awaited once at boot before the
// API/workers/WhatsApp start.
export async function initDb(): Promise<void> {
  await runMigrations();
  await backfillBusinessesFromSettings();
  await seedDefaultAgents();
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await one<{ value: string }>('SELECT value FROM settings WHERE business_id = $1 AND key = $2', [currentBusinessId(), key]);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await none(
    `INSERT INTO settings (business_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (business_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [currentBusinessId(), key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await many<{ key: string; value: string }>('SELECT key, value FROM settings WHERE business_id = $1', [currentBusinessId()]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
