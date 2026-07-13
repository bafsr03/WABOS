import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrTerminal from 'qrcode-terminal';
import fs from 'node:fs';
import pino from 'pino';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { handleInbound } from './inbound.js';

export type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface WaState {
  status: WaStatus;
  qr: string | null;
  me: { id: string; name?: string } | null;
}

const state: WaState = { status: 'disconnected', qr: null, me: null };
let sock: WASocket | null = null;
let stopping = false;
let reconnectDelay = 2000;

export function getWaState(): WaState {
  return { ...state };
}

export function getSock(): WASocket {
  if (!sock || state.status !== 'connected') throw new Error('WhatsApp is not connected');
  return sock;
}

function setStatus(status: WaStatus, qr: string | null = null) {
  state.status = status;
  state.qr = qr;
  bus.emitEvent({ type: 'wa.status', status, qr, me: state.me });
}

export async function startWhatsApp(): Promise<void> {
  stopping = false;
  setStatus('connecting');

  const { state: authState, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  logger.info({ version }, 'starting WhatsApp socket');

  sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'silent' }) as any,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR code updated — scan it from WhatsApp > Linked Devices');
      qrTerminal.generate(qr, { small: true });
      setStatus('qr', qr);
    }

    if (connection === 'open') {
      reconnectDelay = 2000;
      const id = sock?.user?.id ?? '';
      state.me = { id, name: sock?.user?.name };
      setStatus('connected');
      logger.info({ user: state.me }, 'WhatsApp connected');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      state.me = null;
      setStatus('disconnected');

      if (stopping) return;

      if (loggedOut) {
        logger.warn('session logged out — clearing credentials, a new QR scan is required');
        fs.rmSync(config.authDir, { recursive: true, force: true });
        void startWhatsApp();
      } else {
        logger.warn({ statusCode }, `connection closed — reconnecting in ${reconnectDelay}ms`);
        const delay = reconnectDelay;
        reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
        setTimeout(() => void startWhatsApp(), delay);
      }
    }
  });

  sock.ev.on('messages.upsert', (upsert) => {
    handleInbound(upsert).catch((err) => logger.error({ err }, 'inbound handler failed'));
  });
}

export async function logoutWhatsApp(): Promise<void> {
  stopping = true;
  try {
    await sock?.logout();
  } catch {
    // socket may already be dead; we still clear local credentials
  }
  sock = null;
  fs.rmSync(config.authDir, { recursive: true, force: true });
  state.me = null;
  setStatus('disconnected');
  // start fresh so a new QR is issued immediately
  await startWhatsApp();
}
