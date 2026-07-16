import { logger } from './logger.js';
import { initDb } from './db/index.js';
import { startApi } from './api/server.js';
import { resumeConnections } from './wa/connection.js';
import { registerWorkers } from './workers/index.js';

async function main() {
  await initDb();          // run migrations + idempotent seeds before anything queries
  await registerWorkers();
  await startApi();
  await resumeConnections(); // reconnect every business that already has stored creds
  logger.info('WABOS engine is running');
}

main().catch((err) => {
  logger.error({ err }, 'engine failed to start');
  process.exit(1);
});
