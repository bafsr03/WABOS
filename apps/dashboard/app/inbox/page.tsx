'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, MessageCircle, UserRound, Sparkles, ChevronLeft, FlaskConical, RotateCcw, Trash2 } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, sendTestMessage, startAgentTest, deleteTestConversation } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { cn } from '@/lib/cn';
import { Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Modal';

interface Conversation {
  id: number; mode: 'ai' | 'human'; unread_count: number; last_message_at: number; is_test?: number;
  contact_id: number; jid: string; phone: string; name: string; last_message: string | null; last_direction: string | null;
}
interface Message { id: number; direction: 'in' | 'out'; text: string; from_ai: number; timestamp: number }

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
  const [threadAgentId, setThreadAgentId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const toast = useToast();
  const confirm = useConfirm();

  const loadConversations = useCallback(() => {
    api<Conversation[]>('/api/conversations').then(setConversations).catch(() => {});
  }, []);

  const loadMessages = useCallback((id: number) => {
    api<{ conversation: { agent_id: number | null } | null; messages: Message[] }>(`/api/conversations/${id}/messages`)
      .then((r) => { setMessages(r.messages); setThreadAgentId(r.conversation?.agent_id ?? null); })
      .catch(() => {});
    api(`/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
  }, []);

  // Deep link from the Agents page: /inbox?c=<conversationId> opens that thread.
  useEffect(() => {
    const c = Number(new URLSearchParams(window.location.search).get('c'));
    if (c) setSelectedId(c);
  }, []);

  useEffect(() => {
    loadConversations();
    return connectWs((event) => {
      if (event.type === 'conversation.updated') loadConversations();
      if (event.type === 'message.new' && event.conversationId === selectedIdRef.current) {
        setMessages((prev) => [...prev, event.message]);
        api(`/api/conversations/${event.conversationId}/read`, { method: 'POST' }).catch(() => {});
      }
    });
  }, [loadConversations]);

  useEffect(() => { if (selectedId != null) loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const isTest = selected?.is_test === 1;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || selectedId == null) return;
    const text = draft.trim();
    setSending(true);
    try {
      if (isTest) {
        // Test mode: send AS the customer and let the agent reply. Both the
        // inbound and the AI reply stream back over the websocket.
        setDraft('');
        await sendTestMessage(selectedId, text);
      } else {
        await api(`/api/conversations/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
        setDraft('');
      }
    } catch (err: any) { toast(err.message, 'error'); } finally { setSending(false); }
  }

  async function toggleMode() {
    if (!selected) return;
    const mode = selected.mode === 'ai' ? 'human' : 'ai';
    await api(`/api/conversations/${selected.id}/mode`, { method: 'POST', body: JSON.stringify({ mode }) });
  }

  // Reset a test thread to empty so a fresh test starts (re-runs startAgentTest,
  // which clears prior messages and re-pins the same agent).
  async function resetTest() {
    if (!selected || !threadAgentId) return;
    try {
      await startAgentTest(threadAgentId);
      loadMessages(selected.id);
      toast('Prueba reiniciada', 'info');
    } catch (err: any) { toast(err.message, 'error'); }
  }

  async function deleteTest() {
    if (!selected) return;
    if (!(await confirm({ title: 'Eliminar prueba', message: 'Se eliminará esta conversación de prueba y sus mensajes.', confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await deleteTestConversation(selected.id);
      setSelectedId(null);
      loadConversations();
      toast('Prueba eliminada', 'info');
    } catch (err: any) { toast(err.message, 'error'); }
  }

  return (
    <Shell>
      <div className="flex h-full">
        {/* conversation list */}
        <div className={cn('w-full shrink-0 flex-col border-r border-border bg-surface/50 lg:flex lg:w-80', selected ? 'hidden' : 'flex')}>
          <div className="border-b border-border px-4 py-3.5">
            <h1 className="font-display text-2xl font-semibold text-fg">Conversaciones</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <div className="p-4"><EmptyState icon={<MessageCircle size={22} />} title="Sin conversaciones" desc="Cuando alguien escriba a tu WhatsApp aparecerá aquí." /></div>
            )}
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn('flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition',
                  c.id === selectedId ? 'bg-surface-3' : 'hover:bg-surface-2')}>
                <Avatar name={c.name || c.phone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">{c.name || `+${c.phone}`}</span>
                    <span className="shrink-0 text-[10px] text-subtle">{timeLabel(c.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">{c.last_direction === 'out' ? '↩ ' : ''}{c.last_message ?? ''}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {c.is_test
                        ? <Badge tone="warn" className="!px-1.5 !py-0 text-[10px]">Prueba</Badge>
                        : <Badge tone={c.mode === 'ai' ? 'brand' : 'neutral'} className="!px-1.5 !py-0 text-[10px]">{c.mode === 'ai' ? 'IA' : 'Humano'}</Badge>}
                      {c.unread_count > 0 && <span className="tabular grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* thread */}
        <div className={cn('min-w-0 flex-1 flex-col bg-bg-tint lg:flex', selected ? 'flex' : 'hidden lg:flex')}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-subtle">
              <MessageCircle size={40} strokeWidth={1.4} />
              <p className="text-sm">Selecciona una conversación</p>
            </div>
          ) : (
            <>
              <div className="glass flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button onClick={() => setSelectedId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"><ChevronLeft size={18} /></button>
                  <Avatar name={selected.name || selected.phone} />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      {selected.name || `+${selected.phone}`}
                      {isTest && <Badge tone="warn" className="!px-1.5 !py-0 text-[10px]"><FlaskConical size={10} /> Prueba</Badge>}
                    </div>
                    <div className="tabular text-xs text-subtle">{isTest ? 'Conversación de prueba' : `+${selected.phone}`}</div>
                  </div>
                </div>
                {isTest ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={resetTest} title="Reiniciar prueba"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-fg sm:px-3">
                      <RotateCcw size={13} /> <span className="hidden sm:inline">Reiniciar</span>
                    </button>
                    <button onClick={deleteTest} title="Eliminar prueba"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/16 sm:px-3">
                      <Trash2 size={13} /> <span className="hidden sm:inline">Eliminar</span>
                    </button>
                  </div>
                ) : (
                  <button onClick={toggleMode}
                    className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition sm:px-3',
                      selected.mode === 'ai' ? 'bg-brand/12 text-brand hover:bg-brand/20' : 'bg-surface-3 text-muted hover:text-fg')}>
                    {selected.mode === 'ai'
                      ? <><Sparkles size={13} /> <span className="hidden sm:inline">IA activa — pasar a humano</span><span className="sm:hidden">IA</span></>
                      : <><UserRound size={13} /> <span className="hidden sm:inline">Modo humano — reactivar IA</span><span className="sm:hidden">Humano</span></>}
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-5">
                {isTest && messages.length === 0 && (
                  <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-warn/40 bg-warn/5 px-4 py-3 text-center text-xs text-muted">
                    <FlaskConical size={16} className="mx-auto mb-1.5 text-warn" />
                    Escribe como si fueras el cliente. El agente responderá aquí mismo — sin usar WhatsApp ni contar en tu plan.
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                      m.direction === 'out' ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-border bg-surface text-fg')}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      <p className={cn('mt-1 flex items-center justify-end gap-1 text-right text-[10px]', m.direction === 'out' ? 'text-white/70' : 'text-subtle')}>
                        {m.from_ai ? <Bot size={11} /> : null}{timeLabel(m.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="glass flex items-center gap-2 border-t border-border p-3">
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                  placeholder={isTest ? 'Escribe como cliente para probar al agente…' : 'Escribe una respuesta… (pasa la conversación a modo humano)'}
                  className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
                <button disabled={sending || !draft.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full brand-gradient text-white shadow-[0_4px_14px_-4px_var(--brand)] transition hover:brightness-110 disabled:opacity-50">
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
