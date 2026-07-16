import pg from 'pg';
import { config } from '../config.js';

// Async Postgres access layer, replacing the synchronous better-sqlite3 handle.
// The whole engine now awaits the DB. Query helpers mirror the old shapes:
//   sql.one   ≈ stmt.get()   (first row or undefined)
//   sql.many  ≈ stmt.all()   (all rows)
//   sql.none  ≈ stmt.run()   (no result needed)
//   sql.tx    ≈ db.transaction(fn)
// Placeholders are Postgres-style ($1, $2, …).

// bigint (int8, OID 20) → JS number. Our ids and epoch timestamps are bigint and
// stay well within Number.MAX_SAFE_INTEGER, and the codebase treats them as
// numbers throughout. (Money/REAL columns use double precision → already numbers.)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Tests bind each suite to its own schema; production leaves this empty and
  // uses the default search_path (public).
  ...(config.pgSchema ? { options: `-c search_path=${config.pgSchema}` } : {}),
});

export async function one<T = any>(text: string, params: any[] = []): Promise<T | undefined> {
  const res = await pool.query(text, params);
  return res.rows[0] as T | undefined;
}

export async function many<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function none(text: string, params: any[] = []): Promise<void> {
  await pool.query(text, params);
}

// Run fn inside a transaction on a dedicated client. Commits on success, rolls
// back on throw. The callback receives the client for its own queries.
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const sql = { one, many, none, tx, pool };
