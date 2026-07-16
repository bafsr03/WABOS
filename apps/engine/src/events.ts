import { EventEmitter } from 'node:events';
import { currentBusinessId } from './context.js';

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
  | { type: 'payment.notification'; notification: unknown };

export type WabosEvent = BaseEvent & { businessId?: number };

// Internal events are worker plumbing: they wake up in-process consumers and
// are never forwarded to dashboard WebSocket clients.
export type InternalEvent =
  | { type: 'media.received'; mediaId: number; messageId: number; conversationId: number; contactId: number };

class Bus extends EventEmitter {
  emitEvent(event: WabosEvent) {
    // Stamp the emitting tenant unless the caller set one explicitly.
    this.emit('event', event.businessId === undefined ? { ...event, businessId: currentBusinessId() } : event);
  }
  emitInternal(event: InternalEvent) {
    this.emit('internal', event);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);
