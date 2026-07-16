import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Per-suite Postgres isolation — the multi-tenant analogue of the old temp SQLite
// dir. Each test file gets its own schema; the engine's pool binds to it via
// WABOS_PG_SCHEMA (search_path). Requires the dev Postgres to be running
// (`pnpm pg:dev`, default postgres://postgres:password@localhost:5433/wabos).
//
// Usage (call BEFORE dynamically importing engine modules, so the pool reads the
// schema at import time — mirrors the old useTempDataDir pattern):
//   beforeAll(async () => {
//     schema = await useTempSchema();
//     db = await import('../db/index.js');
//     await db.initDb();
//   });
//   afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

const ADMIN_URL = () => process.env.DATABASE_URL ?? 'postgres://postgres:password@localhost:5433/wabos';

export async function useTempSchema(): Promise<string> {
  const schema = 'test_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const admin = new pg.Client(ADMIN_URL());
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.end();
  process.env.WABOS_PG_SCHEMA = schema;
  process.env.ANTHROPIC_API_KEY = ''; // keep the Anthropic client null (isAiAvailable() → false)
  return schema;
}

export async function dropTempSchema(schema: string): Promise<void> {
  const admin = new pg.Client(ADMIN_URL());
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
