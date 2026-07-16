import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

// One-off: copy the live single-tenant SQLite DB into Postgres, preserving ids,
// so STAND 120 keeps running after the D1 cutover. Idempotent-ish: it TRUNCATEs
// the Postgres data tables first, then re-copies everything.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlitePath = path.join(rootDir, 'data', 'wabos.db');

// FK-safe order (parents before children).
const TABLES = [
  'businesses', 'settings', 'contacts', 'tags', 'contact_tags', 'conversations',
  'messages', 'products', 'faqs', 'agents', 'knowledge_collections', 'knowledge_documents',
  'broadcasts', 'broadcast_recipients', 'media', 'charges', 'receipts', 'jobs',
  'payment_notifications', 'style_analyses', 'history_imports',
];
const NO_ID = new Set(['settings', 'contact_tags']);

async function main() {
  await runMigrations();
  const sqlite = new Database(sqlitePath, { readonly: true });

  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

  const sqliteTables = new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name),
  );

  let totalRows = 0;
  for (const table of TABLES) {
    if (!sqliteTables.has(table)) continue;
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    for (const row of rows) {
      await pool.query(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        cols.map((c) => row[c]),
      );
    }
    if (!NO_ID.has(table)) {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${table}), 1))`,
        [table],
      );
    }
    totalRows += rows.length;
    console.log(`  ${table}: ${rows.length} rows`);
  }

  sqlite.close();
  await pool.end();
  console.log(`\ncopied ${totalRows} rows from SQLite → Postgres.`);
  process.exit(0);
}

main().catch(async (err) => { console.error(err); await pool.end().catch(() => {}); process.exit(1); });
