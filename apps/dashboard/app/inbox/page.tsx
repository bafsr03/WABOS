'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';

interface Conversation {
  id: number;
  mode: 'ai' | 'human';
  unread_count: number;
  last_message_at: number;
  contact_id: number;
  jid: string;
  phone: string;
  name: string;
  last_message: string | null;
  last_direction: string | null;
}

interface Message {
  id: number;
  direction: 'in' | 'out';
  text: string;
  from_ai: number;
  timestamp: number;
}

function timeLabel(ts: number) {
  const d = new Date(ts * 1000);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const loadConversations = useCallback(() => {
    api<Conversation[]>('/api/conversations').then(setConversations).catch(() => {});
  }, []);

  const loadMessages = useCallback((id: number) => {
    api<{ messages: Message[] }>(`/api/conversations/${id}/messages`)
      .then((r) => setMessages(r.messages))
      .catch(() => {});
    api(`/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
    return connectWs((event) => {
      if (event.type === 'conversation.updated') loadConversations();
      if (event.type === 'message.new') {
        if (event.conversationId === selectedIdRef.current) {
          setMessages((prev) => [...prev, event.message]);
          api(`/api/conversations/${event.conversationId}/read`, { method: 'POST' }).catch(() => {});
        }
      }
    });
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId != null) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || selectedId == null) return;
    setSending(true);
    try {
      await api(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: draft.trim() }),
      });
      setDraft('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  async function toggleMode() {
    if (!selected) return;
    const mode = selected.mode === 'ai' ? 'human' : 'ai';
    await api(`/api/conversations/${selected.id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  return (
    <Shell>
      <div className="flex h-screen">
        {/* conversation list */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h1 className="font-semibold">Inbox</h1>
          </div>
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-slate-400">
              Aún no hay conversaciones. Cuando alguien escriba a tu WhatsApp aparecerá aquí.
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                c.id === selectedId ? 'bg-emerald-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">{c.name || `+${c.phone}`}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{timeLabel(c.last_message_at)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {c.last_direction === 'out' ? '↩ ' : ''}{c.last_message ?? ''}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    c.mode === 'ai' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {c.mode === 'ai' ? 'IA' : 'Humano'}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-wa px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {c.unread_count}
                    </span>
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* thread */}
        <div className="flex flex-1 flex-col bg-slate-100">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Selecciona una conversación
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
                <div>
                  <div className="font-medium">{selected.name || `+${selected.phone}`}</div>
                  <div className="text-xs text-slate-400">+{selected.phone}</div>
                </div>
                <button
                  onClick={toggleMode}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    selected.mode === 'ai'
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {selected.mode === 'ai' ? '🤖 IA activa — pasar a humano' : '👤 Modo humano — reactivar IA'}
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-5">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                      m.direction === 'out' ? 'bg-emerald-200' : 'bg-white'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p className="mt-1 text-right text-[10px] text-slate-500">
                        {m.from_ai ? '🤖 ' : ''}{timeLabel(m.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-white p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe una respuesta… (esto pasa la conversación a modo humano)"
                  className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-wa-dark focus:outline-none"
                />
                <button
                  disabled={sending || !draft.trim()}
                  className="rounded-full bg-wa-dark px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
