import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local dev Postgres, no Docker/system install required. Runs a real Postgres
// server (binary bundled by embedded-postgres) on :5433 with a persistent data
// dir. Keep this process running in a terminal (`pnpm pg:dev`); the engine and
// tests connect via DATABASE_URL. Decoupled from the engine's tsx-watch reloads.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, '.pgdata');
const PORT = Number(process.env.PGDEV_PORT ?? 5433);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'password',
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error('[pg]', e),
});

async function main() {
  const fresh = !fs.existsSync(dataDir);
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('wabos');
  console.log(`embedded postgres ready on :${PORT} (database "wabos")`);
  console.log(`DATABASE_URL=postgres://postgres:password@localhost:${PORT}/wabos`);

  const shutdown = async () => { try { await pg.stop(); } catch { /* already down */ } process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => {}, 1 << 30); // keep alive
}

main().catch((e) => { console.error(e); process.exit(1); });
