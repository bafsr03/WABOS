'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Send, Users } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { PageHeader, Card, Input, Textarea, Select, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Tag { id: number; name: string }
interface Broadcast { id: number; name: string; message: string; tag_name: string | null; status: string; total: number; sent: number; failed: number; created_at: number }
interface Contact { id: number; tags: Tag[] }

const STATUS: Record<string, { label: string; tone: any }> = {
  pending: { label: 'Pendiente', tone: 'neutral' }, sending: { label: 'Enviando…', tone: 'warn' },
  done: { label: 'Completada', tone: 'success' }, failed: { label: 'Fallida', tone: 'danger' },
};

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: '', message: '', tagId: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => {
    api<Broadcast[]>('/api/broadcasts').then(setBroadcasts).catch(() => {});
    api<Tag[]>('/api/tags').then(setTags).catch(() => {});
    api<Contact[]>('/api/contacts').then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return connectWs((event) => { if (event.type === 'broadcast.progress') load(); });
  }, [load]);

  const recipientCount = form.tagId
    ? contacts.filter((c) => c.tags.some((t) => t.id === Number(form.tagId))).length
    : contacts.length;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!(await confirm({ title: 'Enviar campaña', message: `Se enviará a ${recipientCount} contacto(s), con pausas de 6–12 s entre cada mensaje para proteger tu número.`, confirmLabel: 'Enviar' }))) return;
    setSending(true);
    try {
      await api('/api/broadcasts', { method: 'POST', body: JSON.stringify({ name: form.name, message: form.message, tagId: form.tagId ? Number(form.tagId) : null }) });
      setForm({ name: '', message: '', tagId: '' });
      toast('Campaña iniciada', 'success');
      load();
    } catch (err: any) { setError(err.message); } finally { setSending(false); }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <PageHeader title="Campañas" subtitle="Envía mensajes a segmentos de clientes. WABOS espacia los envíos para proteger tu número." />

        <Card className="space-y-3 p-5">
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre, ej. Promo Día de la Madre" />
              <Select value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })}>
                <option value="">Todos los contactos ({contacts.length})</option>
                {tags.map((t) => <option key={t.id} value={t.id}>Etiqueta: {t.name}</option>)}
              </Select>
            </div>
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Mensaje…" rows={3} />
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Users size={13} /> Destinatarios: <b className="tabular text-fg">{recipientCount}</b></span>
              <Button disabled={sending || !form.name || !form.message || recipientCount === 0}>
                <Send size={15} /> {sending ? 'Creando…' : 'Enviar campaña'}
              </Button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>
        </Card>

        <div className="mt-5 space-y-3">
          {broadcasts.length === 0 && (
            <EmptyState icon={<Megaphone size={24} />} title="Sin campañas todavía" desc="Crea una arriba para llegar a tus clientes." tall />
          )}
          {broadcasts.map((b) => {
            const s = STATUS[b.status] ?? { label: b.status, tone: 'neutral' };
            const pct = b.total ? ((b.sent + b.failed) / b.total) * 100 : 0;
            return (
              <Card key={b.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {b.name}
                      <span className="text-xs font-normal text-subtle">{b.tag_name ? `· ${b.tag_name}` : '· todos'}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{b.message}</p>
                  </div>
                  <Badge tone={s.tone} dot={b.status === 'sending'}>{s.label}</Badge>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full brand-gradient" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut' }} />
                </div>
                <p className="tabular mt-1.5 text-xs text-subtle">{b.sent} enviados · {b.failed} fallidos · {b.total} en total</p>
              </Card>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
