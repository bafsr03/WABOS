import './db/index.js';
import { logger } from './logger.js';
import { startApi } from './api/server.js';
import { startWhatsApp } from './wa/connection.js';
import { registerWorkers } from './workers/index.js';

async function main() {
  registerWorkers();
  await startApi();
  await startWhatsApp();
  logger.info('WABOS engine is running');
}

main().catch((err) => {
  logger.error({ err }, 'engine failed to start');
  process.exit(1);
});
