import { EventEmitter } from 'node:events';

// Single in-process bus. Everything the dashboard needs to know in realtime
// flows through here and is forwarded to WebSocket clients by the API layer.
export type WabosEvent =
  | { type: 'wa.status'; status: string; qr?: string | null; me?: { id: string; name?: string } | null }
  | { type: 'message.new'; conversationId: number; message: unknown }
  | { type: 'conversation.updated'; conversation: unknown }
  | { type: 'broadcast.progress'; broadcast: unknown }
  | { type: 'charge.updated'; charge: unknown }
  | { type: 'receipt.review_needed'; receipt: unknown }
  | { type: 'payment.notification'; notification: unknown };

// Internal events are worker plumbing: they wake up in-process consumers and
// are never forwarded to dashboard WebSocket clients.
export type InternalEvent =
  | { type: 'media.received'; mediaId: number; messageId: number; conversationId: number; contactId: number };

class Bus extends EventEmitter {
  emitEvent(event: WabosEvent) {
    this.emit('event', event);
  }
  emitInternal(event: InternalEvent) {
    this.emit('internal', event);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);
