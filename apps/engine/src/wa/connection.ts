import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrTerminal from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { getSetting } from '../db/index.js';
import { currentBusinessId, runWithBusiness } from '../context.js';
import { wipeAllData, reconcileLinkedNumber } from '../modules/reset.js';
import { jidToPhone } from '../modules/store.js';
import { handleInbound } from './inbound.js';
import { handleHistorySync } from './history.js';

// Connection manager: one Baileys socket per business, keyed by business_id, each
// with its own on-disk credentials (auth/business_<id>/) and connection state.
// Every socket event runs inside runWithBusiness(bid) so downstream queries and
// emitted events scope to the right tenant.

export type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface Conn {
  status: WaStatus;
  qr: string | null;
  me: { id: string; name?: string } | null;
  sock: WASocket | null;
  stopping: boolean;
  reconnectDelay: number;
}

const conns = new Map<number, Conn>();

function conn(businessId: number): Conn {
  let c = conns.get(businessId);
  if (!c) {
    c = { status: 'disconnected', qr: null, me: null, sock: null, stopping: false, reconnectDelay: 2000 };
    conns.set(businessId, c);
  }
  return c;
}

function authDirFor(businessId: number): string {
  return path.join(config.rootDir, 'auth', `business_${businessId}`);
}

export function getWaState(businessId: number = currentBusinessId()): { status: WaStatus; qr: string | null; me: Conn['me'] } {
  const c = conn(businessId);
  return { status: c.status, qr: c.qr, me: c.me };
}

export function getSock(businessId: number = currentBusinessId()): WASocket {
  const c = conn(businessId);
  if (!c.sock || c.status !== 'connected') throw new Error('WhatsApp is not connected');
  return c.sock;
}

function setStatus(businessId: number, status: WaStatus, qr: string | null = null) {
  const c = conn(businessId);
  c.status = status;
  c.qr = qr;
  bus.emitEvent({ type: 'wa.status', businessId, status, qr, me: c.me });
}

export async function startWhatsApp(businessId: number = currentBusinessId()): Promise<void> {
  const c = conn(businessId);
  c.stopping = false;
  setStatus(businessId, 'connecting');

  const { state: authState, saveCreds } = await useMultiFileAuthState(authDirFor(businessId));
  const { version } = await fetchLatestBaileysVersion();
  logger.info({ version, businessId }, 'starting WhatsApp socket');

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'silent' }) as any,
    markOnlineOnConnect: false,
    syncFullHistory: (await getSetting('history_full_sync', '0')) === '1',
    generateHighQualityLinkPreview: false,
  });
  c.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messaging-history.set', (payload) => {
    void runWithBusiness(businessId, () =>
      handleHistorySync(payload).catch((err) => logger.error({ err, businessId }, 'history sync handler failed')));
  });

  sock.ev.on('connection.update', (update) => {
    void runWithBusiness(businessId, async () => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info({ businessId }, 'QR code updated — scan it from WhatsApp > Linked Devices');
        qrTerminal.generate(qr, { small: true });
        setStatus(businessId, 'qr', qr);
      }

      if (connection === 'open') {
        c.reconnectDelay = 2000;
        const id = sock.user?.id ?? '';
        c.me = { id, name: sock.user?.name };
        // If a different number just linked, reset the connection layer (keeping
        // the brand) so stale texts from the old number never display.
        if (id) await reconcileLinkedNumber(jidToPhone(id)).catch((err) => logger.error({ err, businessId }, 'reconcileLinkedNumber failed'));
        setStatus(businessId, 'connected');
        logger.info({ businessId, user: c.me }, 'WhatsApp connected');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        c.me = null;
        setStatus(businessId, 'disconnected');

        if (c.stopping) return;

        if (loggedOut) {
          logger.warn({ businessId }, 'session logged out — clearing credentials, a new QR scan is required');
          fs.rmSync(authDirFor(businessId), { recursive: true, force: true });
          void runWithBusiness(businessId, () => startWhatsApp(businessId));
        } else {
          logger.warn({ businessId, statusCode }, `connection closed — reconnecting in ${c.reconnectDelay}ms`);
          const delay = c.reconnectDelay;
          c.reconnectDelay = Math.min(c.reconnectDelay * 2, 60_000);
          setTimeout(() => void runWithBusiness(businessId, () => startWhatsApp(businessId)), delay);
        }
      }
    });
  });

  sock.ev.on('messages.upsert', (upsert) => {
    void runWithBusiness(businessId, () =>
      handleInbound(upsert).catch((err) => logger.error({ err, businessId }, 'inbound handler failed')));
  });
}

// Unlink the number entirely: log out, WIPE this business's data, re-issue a QR.
export async function logoutWhatsApp(businessId: number = currentBusinessId()): Promise<void> {
  const c = conn(businessId);
  c.stopping = true;
  try { await c.sock?.logout(); } catch { /* socket may already be dead */ }
  c.sock = null;
  fs.rmSync(authDirFor(businessId), { recursive: true, force: true });
  await wipeAllData();
  c.me = null;
  setStatus(businessId, 'disconnected');
  await startWhatsApp(businessId);
}

// Unlink the current session and re-issue a QR. Does NOT touch data/account_phone:
// reconcileLinkedNumber() decides on the next connect (same number keeps data).
export async function changeNumber(businessId: number = currentBusinessId()): Promise<void> {
  const c = conn(businessId);
  c.stopping = true;
  try { await c.sock?.logout(); } catch { /* already dead */ }
  c.sock = null;
  fs.rmSync(authDirFor(businessId), { recursive: true, force: true });
  c.me = null;
  setStatus(businessId, 'disconnected');
  await startWhatsApp(businessId);
}

// Pause the socket without clearing auth/data (dashboard sign-out). Reconnect
// resumes with the same number, no QR.
export async function pauseWhatsApp(businessId: number = currentBusinessId()): Promise<void> {
  const c = conn(businessId);
  c.stopping = true;
  try { c.sock?.end(undefined); } catch { /* already down */ }
  c.sock = null;
  c.me = null;
  setStatus(businessId, 'disconnected');
}

// Account deletion: tear the socket down for good, drop its state from the map,
// and delete its credentials. No reconnect, no QR.
export async function purgeConnection(businessId: number): Promise<void> {
  const c = conns.get(businessId);
  if (c) {
    c.stopping = true;
    try { c.sock?.end(undefined); } catch { /* already down */ }
    conns.delete(businessId);
  }
  fs.rmSync(authDirFor(businessId), { recursive: true, force: true });
}

export async function reconnectWhatsApp(businessId: number = currentBusinessId()): Promise<void> {
  const c = conn(businessId);
  if (c.status === 'connected' || c.status === 'connecting' || c.status === 'qr') return;
  await startWhatsApp(businessId); // reuses stored creds → reconnects without a new QR
}

// On boot, reconnect every business that already has stored credentials on disk
// (auth/business_<id>/creds.json). New tenants have none — their socket starts
// lazily when they open the Conexión page (POST /api/session/open).
export async function resumeConnections(): Promise<void> {
  const authRoot = path.join(config.rootDir, 'auth');
  let entries: string[] = [];
  try { entries = fs.readdirSync(authRoot); } catch { return; }
  for (const entry of entries) {
    const m = /^business_(\d+)$/.exec(entry);
    if (!m) continue;
    if (!fs.existsSync(path.join(authRoot, entry, 'creds.json'))) continue;
    const businessId = Number(m[1]);
    await runWithBusiness(businessId, () => startWhatsApp(businessId))
      .catch((err) => logger.error({ err, businessId }, 'failed to resume connection'));
  }
}
