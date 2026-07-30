import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { currentBusinessId } from './context.js';
import { isSplit } from './roles.js';

// Single in-process bus. Everything the dashboard needs to know in realtime
// flows through here and is forwarded to WebSocket clients by the API layer.
// Every event carries a businessId (stamped from context at emit time unless the
// emitter set one) so the WS layer forwards only a client's own tenant events.
type BaseEvent =
  | { type: 'wa.status'; status: string; qr?: string | null; me?: { id: string; name?: string } | null }
  | { type: 'message.new'; conversationId: number; message: unknown }
  | { type: 'conversation.updated'; conversation: unknown }
  | { type: 'broadcast.progress'; broadcast: unknown }
  | { type: 'style.progress'; analysis: unknown }
  | { type: 'history.progress'; import: unknown }
  | { type: 'account.number_changed' }
  | { type: 'charge.updated'; charge: unknown }
  | { type: 'receipt.review_needed'; receipt: unknown }
  | { type: 'payment.notification'; notification: unknown }
  | { type: 'ai.quota_exceeded'; conversationId: number };

export type WabosEvent = BaseEvent & { businessId?: number };

// Internal events are worker plumbing: they wake up in-process consumers and
// are never forwarded to dashboard WebSocket clients.
export type InternalEvent =
  | { type: 'media.received'; mediaId: number; messageId: number; conversationId: number; contactId: number };

// This process's origin id, so the LISTEN/NOTIFY bridge can ignore the echo of
// its own emits (Postgres delivers your NOTIFY back to you).
const ORIGIN = randomUUID();
const NOTIFY_CHANNEL = 'wabos_events';

class Bus extends EventEmitter {
  emitEvent(event: WabosEvent) {
    // Stamp the emitting tenant unless the caller set one explicitly.
    const stamped = event.businessId === undefined ? { ...event, businessId: currentBusinessId() } : event;
    this.emit('event', stamped);
    // When the store and whatsapp backends run as separate processes, fan the
    // dashboard-facing event out to the other process over Postgres so its WS
    // forwarder (api/server.ts) and push dispatcher (modules/push.ts) still fire.
    if (isSplit) void publishEvent(stamped);
  }
  emitInternal(event: InternalEvent) {
    // Internal (worker plumbing) events stay in-process — their producer and
    // consumer always live in the same role — so they are never bridged.
    this.emit('internal', event);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);

// pg_notify has an ~8KB payload cap. Events are small (ids + a compact row), but
// if one ever overflows we log and drop the realtime echo rather than crash — the
// dashboard reconciles on its next fetch/navigation.
async function publishEvent(event: WabosEvent) {
  try {
    const { none } = await import('./db/pool.js');
    await none(`SELECT pg_notify($1, $2)`, [NOTIFY_CHANNEL, JSON.stringify({ ...event, _origin: ORIGIN })]);
  } catch (err) {
    const { logger } = await import('./logger.js');
    logger.warn({ err, type: (event as any).type }, 'event bridge publish failed');
  }
}

// Hold a dedicated Postgres connection that LISTENs for events emitted by the
// other backend and re-emits them onto the local bus. Registered at boot for
// both split roles; a no-op in ROLE=all. Reconnects if the connection drops.
export async function startEventBridge() {
  if (!isSplit) return;
  const { pool } = await import('./db/pool.js');
  const { logger } = await import('./logger.js');

  const connect = async () => {
    const client = await pool.connect();
    client.on('notification', (msg) => {
      if (!msg.payload) return;
      try {
        const parsed = JSON.parse(msg.payload);
        if (parsed._origin === ORIGIN) return; // echo of our own emit
        delete parsed._origin;
        bus.emit('event', parsed); // already tenant-stamped by the emitter
      } catch (err) {
        logger.warn({ err }, 'event bridge received malformed payload');
      }
    });
    client.on('error', (err) => {
      logger.error({ err }, 'event bridge connection error — reconnecting');
      try { client.release(err); } catch { /* already gone */ }
      setTimeout(() => void connect().catch((e) => logger.error({ err: e }, 'event bridge reconnect failed')), 2000);
    });
    await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
    logger.info('event bridge listening on Postgres');
  };

  await connect();
}
