'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, Trash2, StickyNote, Tag as TagIcon, Users } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { PageHeader, Card, Input, Button, Avatar, EmptyState } from '@/components/ui/primitives';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Tag { id: number; name: string }
interface Contact { id: number; phone: string; name: string; notes: string; tags: Tag[]; conversation_id: number | null }

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ phone: '', name: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => { api<Contact[]>('/api/contacts').then(setContacts).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/contacts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ phone: '', name: '' });
      toast('Contacto agregado', 'success');
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function addTag(contact: Contact) {
    const tag = prompt(`Etiqueta para ${contact.name || contact.phone}:`);
    if (!tag?.trim()) return;
    await api(`/api/contacts/${contact.id}/tags`, { method: 'POST', body: JSON.stringify({ tag: tag.trim() }) });
    load();
  }
  async function removeTag(contact: Contact, tag: Tag) {
    await api(`/api/contacts/${contact.id}/tags/${tag.id}`, { method: 'DELETE' });
    load();
  }
  async function saveNotes() {
    if (!editing) return;
    await api(`/api/contacts/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ notes: notesDraft }) });
    setEditing(null);
    toast('Notas guardadas', 'success');
    load();
  }
  async function remove(contact: Contact) {
    if (!(await confirm({ title: 'Eliminar contacto', message: `Se borrará ${contact.name || contact.phone} y toda su conversación.`, confirmLabel: 'Eliminar', danger: true }))) return;
    await api(`/api/contacts/${contact.id}`, { method: 'DELETE' });
    toast('Contacto eliminado', 'info');
    load();
  }

  const filtered = contacts.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <PageHeader title="Contactos" subtitle="Tu CRM: clientes, etiquetas y notas." />

        <Card className="p-4">
          <form onSubmit={addContact} className="flex flex-wrap gap-2">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Número con código de país, ej. 51987654321" className="w-full sm:w-72" />
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className="flex-1" />
            <Button disabled={!form.phone}><Plus size={15} /> Agregar</Button>
          </form>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </Card>

        <div className="relative mt-5">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contactos…" className="pl-10" />
        </div>

        <Card className="mt-4 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-4"><EmptyState icon={<Users size={24} />} title="Sin contactos" desc="Agrega uno arriba o espera a que te escriban." /></div>
          ) : filtered.map((c) => (
            <div key={c.id} className="flex items-start gap-3 border-b border-border px-4 py-4 last:border-0">
              <Avatar name={c.name || c.phone} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{c.name || 'Sin nombre'} <span className="tabular text-xs font-normal text-subtle">+{c.phone}</span></div>
                {c.notes && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><StickyNote size={11} /> {c.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <button key={t.id} onClick={() => removeTag(c, t)} title="Clic para quitar"
                      className="group inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-xs text-brand transition hover:bg-danger/15 hover:text-danger">
                      {t.name} <span className="opacity-60 group-hover:opacity-100">×</span>
                    </button>
                  ))}
                  <button onClick={() => addTag(c)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-subtle transition hover:border-brand hover:text-brand">
                    <TagIcon size={11} /> etiqueta
                  </button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => { setEditing(c); setNotesDraft(c.notes); }} className="grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-fg" title="Notas"><StickyNote size={15} /></button>
                <button onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg text-subtle transition hover:bg-danger/12 hover:text-danger" title="Eliminar"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Notas · ${editing?.name || editing?.phone || ''}`}>
        <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={4} autoFocus
          className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          placeholder="Preferencias, historial, recordatorios…" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={saveNotes}>Guardar</Button>
        </div>
      </Modal>
    </Shell>
  );
}
