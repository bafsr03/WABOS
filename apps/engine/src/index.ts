import { logger } from './logger.js';
import { initDb } from './db/index.js';
import { startApi } from './api/server.js';
import { resumeConnections } from './wa/connection.js';
import { registerWorkers } from './workers/index.js';
import { startEventBridge } from './events.js';
import { role, runsWhatsapp } from './roles.js';

async function main() {
  await initDb();            // run migrations + idempotent seeds before anything queries
  await startEventBridge();  // LISTEN for the other backend's events (no-op in ROLE=all)
  await registerWorkers();   // registers only this role's job handlers + schedulers
  await startApi();          // store role serves the full API+WS; whatsapp role serves media + /internal/*
  if (runsWhatsapp) {
    await resumeConnections(); // reconnect every business that already has stored creds
  }
  logger.info({ role }, 'WABOS engine is running');
}

main().catch((err) => {
  logger.error({ err }, 'engine failed to start');
  process.exit(1);
});
