'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, BookOpen, Check, ChevronRight, Star, Pin } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Input, Textarea, Field, Button, Badge, EmptyState, Select, Switch } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type Kind = 'policy' | 'guide' | 'brand' | 'faq' | 'other';
const KINDS: { id: Kind; label: string; tone: 'brand' | 'info' | 'accent' | 'warn' | 'neutral' }[] = [
  { id: 'policy', label: 'Política', tone: 'warn' },
  { id: 'guide', label: 'Guía', tone: 'info' },
  { id: 'brand', label: 'Marca', tone: 'accent' },
  { id: 'faq', label: 'FAQ', tone: 'brand' },
  { id: 'other', label: 'Otro', tone: 'neutral' },
];
const kindMeta = (k: Kind) => KINDS.find((x) => x.id === k) ?? KINDS[4];

interface Collection { id: number; name: string; description: string }
interface Doc {
  id: number; collection_id: number | null; title: string; kind: Kind;
  summary: string; content: string; keywords: string; pinned: number; active: number;
}

type View = { mode: 'list' } | { mode: 'edit'; doc: Doc | null };

export default function KnowledgePage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [view, setView] = useState<View>({ mode: 'list' });
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => {
    api<Collection[]>('/api/knowledge/collections').then(setCollections).catch(() => {});
    api<Doc[]>('/api/knowledge/documents').then(setDocs).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function remove(d: Doc, back = false) {
    if (!(await confirm({ title: 'Eliminar documento', message: `Se eliminará "${d.title}" de la base de conocimiento.`, confirmLabel: 'Eliminar', danger: true }))) return;
    await api(`/api/knowledge/documents/${d.id}`, { method: 'DELETE' });
    toast('Documento eliminado', 'info');
    load();
    if (back) setView({ mode: 'list' });
  }

  return (
    <Shell>
      {view.mode === 'list' ? (
        <ListView
          collections={collections}
          docs={docs}
          onReloadCollections={load}
          onNew={() => setView({ mode: 'edit', doc: null })}
          onOpen={(d) => setView({ mode: 'edit', doc: d })}
          onDelete={(d) => remove(d)}
          confirm={confirm}
          toast={toast}
        />
      ) : (
        <EditorView
          doc={view.doc}
          collections={collections}
          onClose={() => setView({ mode: 'list' })}
          onSaved={() => { load(); setView({ mode: 'list' }); }}
          onDelete={(d) => remove(d, true)}
          toast={toast}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ List */

function ListView({ collections, docs, onReloadCollections, onNew, onOpen, onDelete, confirm, toast }: {
  collections: Collection[];
  docs: Doc[];
  onReloadCollections: () => void;
  onNew: () => void;
  onOpen: (d: Doc) => void;
  onDelete: (d: Doc) => void;
  confirm: (o: any) => Promise<boolean>;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const [filter, setFilter] = useState<number | 'all' | 'none'>('all');
  const [newCol, setNewCol] = useState('');
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => docs.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'none') return d.collection_id === null;
    return d.collection_id === filter;
  }), [docs, filter]);

  async function addCollection() {
    if (!newCol.trim()) return;
    await api('/api/knowledge/collections', { method: 'POST', body: JSON.stringify({ name: newCol.trim() }) });
    setNewCol(''); setAdding(false); onReloadCollections();
    toast('Colección creada', 'success');
  }

  async function removeCollection(c: Collection) {
    if (!(await confirm({ title: 'Eliminar colección', message: `Se eliminará "${c.name}". Sus documentos se conservan sin colección.`, confirmLabel: 'Eliminar', danger: true }))) return;
    await api(`/api/knowledge/collections/${c.id}`, { method: 'DELETE' });
    if (filter === c.id) setFilter('all');
    onReloadCollections();
    toast('Colección eliminada', 'info');
  }

  const chip = (active: boolean) => cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
    active ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg',
  );

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <PageHeader
        title="Conocimiento"
        subtitle="Políticas de envío, guías e info de marca que el Empleado IA consulta para responder."
        actions={<Button onClick={onNew}><Plus size={15} /> Nuevo documento</Button>}
      />

      {/* Collection filter bar */}
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
          <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>Todas</button>
          {collections.map((c) => (
            <span key={c.id} className={cn('group inline-flex items-center', filter === c.id && 'rounded-lg bg-surface shadow-[var(--shadow-card)]')}>
              <button onClick={() => setFilter(c.id)} className={chip(filter === c.id)}>{c.name}</button>
              {filter === c.id && (
                <button onClick={() => removeCollection(c)} title="Eliminar colección" className="pr-2 text-subtle hover:text-danger"><Trash2 size={13} /></button>
              )}
            </span>
          ))}
          <button onClick={() => setFilter('none')} className={chip(filter === 'none')}>Sin colección</button>
          {adding ? (
            <span className="inline-flex items-center gap-1 pl-1">
              <Input value={newCol} onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCollection(); }} placeholder="Nombre…" className="h-8 w-32 py-1 text-sm" autoFocus />
              <button onClick={addCollection} className="grid h-8 w-8 place-items-center rounded-lg text-brand hover:bg-brand/10"><Check size={15} /></button>
            </span>
          ) : (
            <button onClick={() => setAdding(true)} className={chip(false)} title="Nueva colección"><Plus size={14} /></button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={24} />}
          title={docs.length === 0 ? 'Base de conocimiento vacía' : 'Sin documentos aquí'}
          desc={docs.length === 0 ? 'Agrega políticas de envío, guías o info de tu marca.' : 'Esta colección no tiene documentos todavía.'}
          action={<Button onClick={onNew}><Plus size={15} /> Nuevo documento</Button>}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {shown.map((d) => {
            const meta = kindMeta(d.kind);
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(d)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(d); }}
                className="group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-subtle">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('truncate text-sm font-medium text-fg', !d.active && 'opacity-60')}>{d.title}</p>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {d.pinned ? <Star size={13} className="shrink-0 fill-brand text-brand" /> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">{d.summary || d.content || <span className="text-subtle">Sin contenido</span>}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(d); }}
                  title="Eliminar"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle opacity-0 transition hover:bg-danger/12 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight size={16} className="shrink-0 text-subtle" />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Editor */

function EditorView({ doc, collections, onClose, onSaved, onDelete, toast }: {
  doc: Doc | null;
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (d: Doc) => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const isNew = !doc;
  const [title, setTitle] = useState(doc?.title ?? '');
  const [kind, setKind] = useState<Kind>(doc?.kind ?? 'policy');
  const [collectionId, setCollectionId] = useState<string>(doc?.collection_id ? String(doc.collection_id) : '');
  const [summary, setSummary] = useState(doc?.summary ?? '');
  const [content, setContent] = useState(doc?.content ?? '');
  const [keywords, setKeywords] = useState(doc?.keywords ?? '');
  const [pinned, setPinned] = useState(doc ? !!doc.pinned : false);
  const [active, setActive] = useState(doc ? !!doc.active : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(), kind, summary: summary.trim(), content: content.trim(), keywords: keywords.trim(),
      pinned, active, collection_id: collectionId ? Number(collectionId) : null,
    };
    try {
      if (isNew) {
        await api('/api/knowledge/documents', { method: 'POST', body: JSON.stringify(payload) });
        toast('Documento agregado', 'success');
      } else {
        await api(`/api/knowledge/documents/${doc!.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Cambios guardados', 'success');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur lg:px-8">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <span className="truncate text-sm font-medium text-fg">{isNew ? 'Nuevo documento' : 'Editar documento'}</span>
        <Button size="sm" onClick={save} disabled={!title.trim() || saving}>
          <Check size={15} /> {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      <div className="space-y-5 p-6 lg:p-8">
        {/* Pin + estado */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Pin size={15} className={pinned ? 'text-brand' : 'text-subtle'} />
              <div>
                <p className="text-sm font-medium text-fg">Fijar en el contexto de la IA</p>
                <p className="mt-0.5 text-xs text-muted">Su resumen se incluye siempre. Sin fijar, se consulta por búsqueda.</p>
              </div>
            </div>
            <Switch checked={pinned} onChange={setPinned} label="Fijar" />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <p className="text-sm font-medium text-fg">Estado</p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
              {[{ v: true, l: 'Activo' }, { v: false, l: 'Borrador' }].map((o) => (
                <button key={o.l} onClick={() => setActive(o.v)}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition', active === o.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <Field label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Política de envíos" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </Select>
            </Field>
            <Field label="Colección">
              <Select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                <option value="">Sin colección</option>
                {collections.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Resumen" hint="Una o dos líneas. Es lo que la IA ve siempre si el documento está fijado.">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Ej. Delivery en Lima 12–20h; a provincia por agencia (Shalom/Olva)." />
          </Field>
          <Field label="Contenido" hint="El texto completo que la IA obtiene al buscar este documento.">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} placeholder="Explica la política, guía o información con detalle." />
          </Field>
          <Field label="Palabras clave" hint="Opcional. Separadas por comas, para mejorar la búsqueda.">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="envío, delivery, provincia, agencia" />
          </Field>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        {!isNew && (
          <Button variant="danger" className="w-full" onClick={() => onDelete(doc!)}>
            <Trash2 size={15} /> Eliminar documento
          </Button>
        )}
      </div>
    </div>
  );
}
