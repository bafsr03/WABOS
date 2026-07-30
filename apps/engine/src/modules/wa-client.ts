import { config } from '../config.js';
import { logger } from '../logger.js';
import type { WaStatus } from '../wa/connection.js';

// store → whatsapp internal client. Under the split, the store backend has no
// WhatsApp socket, so anything that needs to send a message or read/drive the
// connection calls the whatsapp backend over the internal network, authenticated
// with the shared STORE_INTERNAL_KEY ("keys from both sides"). Never exposed to
// the public internet — only reachable on the Docker service network.

async function call<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${config.waInternalUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': config.storeInternalKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`wa internal ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export async function remoteSend(opts: {
  businessId: number; conversationId: number; text: string; fromAi: boolean; humanized: boolean;
}): Promise<boolean> {
  try {
    const r = await call<{ ok: boolean }>('/internal/send', opts);
    return r.ok;
  } catch (err) {
    logger.error({ err }, 'remote send failed');
    return false;
  }
}

export async function remoteSendOwner(opts: { businessId: number; phone: string; text: string }): Promise<boolean> {
  try {
    const r = await call<{ ok: boolean }>('/internal/send-owner', opts);
    return r.ok;
  } catch (err) {
    logger.error({ err }, 'remote owner-send failed');
    return false;
  }
}

export interface RemoteWaState { status: WaStatus; qr: string | null; me: { id: string; name?: string } | null }

export async function remoteWaState(businessId: number): Promise<RemoteWaState> {
  try {
    return await call<RemoteWaState>('/internal/wa/status', { businessId });
  } catch (err) {
    logger.error({ err, businessId }, 'remote wa status failed');
    return { status: 'disconnected', qr: null, me: null };
  }
}

export async function remoteWaAction(
  action: 'logout' | 'change-number' | 'session-open' | 'session-close' | 'purge',
  businessId: number,
): Promise<void> {
  await call(`/internal/wa/${action}`, { businessId });
}
