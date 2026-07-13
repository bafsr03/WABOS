'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';

interface Tag { id: number; name: string }
interface Broadcast {
  id: number; name: string; message: string; tag_name: string | null;
  status: string; total: number; sent: number; failed: number; created_at: number;
}
interface Contact { id: number; tags: Tag[] }

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', sending: 'Enviando…', done: 'Completada', failed: 'Fallida',
};

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: '', message: '', tagId: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api<Broadcast[]>('/api/broadcasts').then(setBroadcasts).catch(() => {});
    api<Tag[]>('/api/tags').then(setTags).catch(() => {});
    api<Contact[]>('/api/contacts').then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return connectWs((event) => {
      if (event.type === 'broadcast.progress') load();
    });
  }, [load]);

  const recipientCount = form.tagId
    ? contacts.filter((c) => c.tags.some((t) => t.id === Number(form.tagId))).length
    : contacts.length;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!confirm(`Se enviará este mensaje a ${recipientCount} contacto(s), con pausas de 6–12 segundos entre cada envío. ¿Continuar?`)) return;
    setSending(true);
    try {
      await api('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          message: form.message,
          tagId: form.tagId ? Number(form.tagId) : null,
        }),
      });
      setForm({ name: '', message: '', tagId: '' });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">Campañas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envía mensajes a segmentos de clientes. WABOS espacia los envíos para proteger tu número.
        </p>

        <form onSubmit={create} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre de la campaña, ej. Promo Día de la Madre"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
            />
            <select
              value={form.tagId}
              onChange={(e) => setForm({ ...form, tagId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
            >
              <option value="">Todos los contactos ({contacts.length})</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>Etiqueta: {t.name}</option>
              ))}
            </select>
          </div>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Mensaje…"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Destinatarios: <b>{recipientCount}</b></span>
            <button
              disabled={sending || !form.name || !form.message || recipientCount === 0}
              className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending ? 'Creando…' : 'Enviar campaña'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {broadcasts.length === 0 && <p className="p-6 text-sm text-slate-400">Sin campañas todavía.</p>}
          {broadcasts.map((b) => (
            <div key={b.id} className="border-b border-slate-100 px-5 py-4 last:border-0">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {b.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {b.tag_name ? `etiqueta: ${b.tag_name}` : 'todos'}
                  </span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  b.status === 'done' ? 'bg-emerald-100 text-emerald-700'
                  : b.status === 'sending' ? 'bg-amber-100 text-amber-700'
                  : b.status === 'failed' ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-600'
                }`}>
                  {STATUS_LABEL[b.status] ?? b.status}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{b.message}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-wa transition-all"
                  style={{ width: `${b.total ? ((b.sent + b.failed) / b.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {b.sent} enviados · {b.failed} fallidos · {b.total} en total
              </p>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
