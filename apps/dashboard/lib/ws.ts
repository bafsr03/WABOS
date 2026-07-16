import { ENGINE_URL, getToken } from './api';

export type EngineEvent = {
  type: 'wa.status' | 'message.new' | 'conversation.updated' | 'broadcast.progress'
    | 'charge.updated' | 'receipt.review_needed' | 'payment.notification' | 'style.progress' | 'history.progress' | 'account.number_changed';
  [key: string]: any;
};

// Opens the realtime socket to the engine; reconnects automatically until closed.
export function connectWs(onEvent: (event: EngineEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    const wsUrl = ENGINE_URL.replace(/^http/, 'ws');
    ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(getToken())}`);
    ws.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => {
      if (!closed) retry = setTimeout(open, 2000);
    };
  };

  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
