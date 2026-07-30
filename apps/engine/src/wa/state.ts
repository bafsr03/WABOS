import { currentBusinessId } from '../context.js';
import { runsWhatsapp } from '../roles.js';
import {
  getWaState, logoutWhatsApp, changeNumber, pauseWhatsApp, reconnectWhatsApp, purgeConnection,
  type WaStatus,
} from './connection.js';
import { remoteWaState, remoteWaAction } from '../modules/wa-client.js';

// Role-aware facade over the WhatsApp connection. When this process runs the
// WhatsApp role the socket is local, so these delegate straight to connection.ts.
// When it's the store role, they hop to the whatsapp backend over the internal
// keyed channel. ROLE=all is the local path. All async so both paths share a shape.

export interface WaStateView { status: WaStatus; qr: string | null; me: { id: string; name?: string } | null }

export async function waState(businessId: number = currentBusinessId()): Promise<WaStateView> {
  return runsWhatsapp ? getWaState(businessId) : remoteWaState(businessId);
}

export async function waLogout(businessId: number = currentBusinessId()): Promise<void> {
  return runsWhatsapp ? logoutWhatsApp(businessId) : remoteWaAction('logout', businessId);
}

export async function waChangeNumber(businessId: number = currentBusinessId()): Promise<void> {
  return runsWhatsapp ? changeNumber(businessId) : remoteWaAction('change-number', businessId);
}

export async function waSessionOpen(businessId: number = currentBusinessId()): Promise<void> {
  return runsWhatsapp ? reconnectWhatsApp(businessId) : remoteWaAction('session-open', businessId);
}

export async function waSessionClose(businessId: number = currentBusinessId()): Promise<void> {
  return runsWhatsapp ? pauseWhatsApp(businessId) : remoteWaAction('session-close', businessId);
}

export async function waPurge(businessId: number): Promise<void> {
  return runsWhatsapp ? purgeConnection(businessId) : remoteWaAction('purge', businessId);
}
