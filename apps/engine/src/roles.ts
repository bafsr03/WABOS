import { config } from './config.js';

// Derived role flags used across boot, workers, the event bridge, and send
// routing. See config.role for the meaning of each role.
//   ROLE=all      → runsStore && runsWhatsapp (classic monolith, default)
//   ROLE=store    → runsStore only
//   ROLE=whatsapp → runsWhatsapp only
export const role = config.role;
export const runsStore = role === 'all' || role === 'store';
export const runsWhatsapp = role === 'all' || role === 'whatsapp';
// True when the two backends run as separate processes and must talk over the
// internal keyed channel + the Postgres LISTEN/NOTIFY event bridge.
export const isSplit = role !== 'all';
