'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

interface Tag { id: number; name: string }
interface Contact {
  id: number; phone: string; name: string; notes: string;
  tags: Tag[]; conversation_id: number | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ phone: '', name: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Contact[]>('/api/contacts').then(setContacts).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/contacts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ phone: '', name: '' });
      load();
    } catch (err: any) {
      setError(err.message);
    }
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

  async function editNotes(contact: Contact) {
    const notes = prompt('Notas del cliente:', contact.notes);
    if (notes === null) return;
    await api(`/api/contacts/${contact.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
    load();
  }

  async function remove(contact: Contact) {
    if (!confirm(`¿Eliminar a ${contact.name || contact.phone} y toda su conversación?`)) return;
    await api(`/api/contacts/${contact.id}`, { method: 'DELETE' });
    load();
  }

  const filtered = contacts.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">Contactos</h1>
        <p className="mt-1 text-sm text-slate-500">Tu CRM: clientes, etiquetas y notas.</p>

        <form onSubmit={addContact} className="mt-6 flex gap-2">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Número con código de país, ej. 51987654321"
            className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <button
            disabled={!form.phone}
            className="rounded-lg bg-wa-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="mt-6 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
        />

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {filtered.length === 0 && <p className="p-6 text-sm text-slate-400">Sin contactos todavía.</p>}
          {filtered.map((c) => (
            <div key={c.id} className="flex items-start justify-between border-b border-slate-100 px-5 py-4 last:border-0">
              <div className="min-w-0">
                <div className="font-medium">{c.name || 'Sin nombre'} <span className="text-sm font-normal text-slate-400">+{c.phone}</span></div>
                {c.notes && <p className="mt-0.5 text-xs text-slate-500">📝 {c.notes}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => removeTag(c, t)}
                      title="Clic para quitar"
                      className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 hover:bg-red-100 hover:text-red-600"
                    >
                      {t.name} ×
                    </button>
                  ))}
                  <button onClick={() => addTag(c)} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-wa-dark hover:text-wa-dark">
                    + etiqueta
                  </button>
                </div>
              </div>
              <div className="ml-4 flex shrink-0 gap-2 text-xs">
                <button onClick={() => editNotes(c)} className="text-slate-500 hover:text-slate-800">Notas</button>
                <button onClick={() => remove(c)} className="text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
