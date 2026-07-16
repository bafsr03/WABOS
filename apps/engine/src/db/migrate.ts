import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, none, many } from './pool.js';
import { logger } from '../logger.js';

// Minimal forward-only migration runner. Applies every *.sql in migrations/ in
// filename order exactly once, tracked in schema_migrations. Each file may hold
// many statements (run as one multi-statement query). Replaces the SQLite
// CREATE-IF-NOT-EXISTS + addColumnIfMissing bootstrap.

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations(): Promise<void> {
  await none(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    applied_at bigint NOT NULL DEFAULT (extract(epoch from now())::bigint)
  )`);
  const applied = new Set(
    (await many<{ version: string }>('SELECT version FROM schema_migrations')).map((r) => r.version),
  );
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(text);
    await none('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    logger.info({ migration: file }, 'applied migration');
  }
}
