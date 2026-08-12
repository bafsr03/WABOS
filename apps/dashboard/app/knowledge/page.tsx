'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, BookOpen, Check, ChevronRight, Star, Pin, Sparkles, HelpCircle, X } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, getFlag, setFlag } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, PageBody, Card, Input, Textarea, Field, Button, Badge, EmptyState, Select, Switch } from '@/components/ui/primitives';
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

type Seed = { title?: string; kind?: Kind; summary?: string };
type View = { mode: 'list' } | { mode: 'edit'; doc: Doc | null; seed?: Seed };

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
          onNew={(seed) => setView({ mode: 'edit', doc: null, seed })}
          onOpen={(d) => setView({ mode: 'edit', doc: d })}
          onDelete={(d) => remove(d)}
          confirm={confirm}
          toast={toast}
        />
      ) : (
        <EditorView
          doc={view.doc}
          seed={view.seed}
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

interface Faq { id: number; question: string; answer: string }

const EXAMPLES: { label: string; seed: Seed }[] = [
  { label: 'Política de envíos', seed: { title: 'Política de envíos', kind: 'policy', summary: 'Delivery en Lima 12–20h; a provincia por agencia (Shalom/Olva).' } },
  { label: 'Devoluciones', seed: { title: 'Política de devoluciones', kind: 'policy', summary: 'Cambios dentro de 7 días con boleta y producto sin uso.' } },
  { label: 'Sobre la marca', seed: { title: 'Sobre nuestra marca', kind: 'brand', summary: 'Quiénes somos, qué vendemos y qué nos hace diferentes.' } },
];

function ListView({ collections, docs, onReloadCollections, onNew, onOpen, onDelete, confirm, toast }: {
  collections: Collection[];
  docs: Doc[];
  onReloadCollections: () => void;
  onNew: (seed?: Seed) => void;
  onOpen: (d: Doc) => void;
  onDelete: (d: Doc) => void;
  confirm: (o: any) => Promise<boolean>;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const [filter, setFilter] = useState<number | 'all' | 'none'>('all');
  const [newCol, setNewCol] = useState('');
  const [adding, setAdding] = useState(false);
  const [introHidden, setIntroHidden] = useState(true);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' });

  useEffect(() => { setIntroHidden(getFlag('knowledge_intro_hidden')); }, []);
  const loadFaqs = useCallback(() => { api<Faq[]>('/api/faqs').then(setFaqs).catch(() => {}); }, []);
  useEffect(() => { loadFaqs(); }, [loadFaqs]);

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;
    await api('/api/faqs', { method: 'POST', body: JSON.stringify(faqForm) });
    setFaqForm({ question: '', answer: '' });
    loadFaqs();
    toast('Pregunta agregada', 'success');
  }
  async function removeFaq(id: number) {
    await api(`/api/faqs/${id}`, { method: 'DELETE' });
    loadFaqs();
  }
  function dismissIntro() { setFlag('knowledge_intro_hidden', true); setIntroHidden(true); }

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
    <PageBody className="max-w-4xl p-6 lg:p-8">
      <PageHeader
        title="Conocimiento"
        subtitle="Políticas de envío, guías e info de marca que el Empleado IA consulta para responder."
        actions={<Button onClick={() => onNew()}><Plus size={15} /> Nuevo documento</Button>}
      />

      {/* Value / onboarding intro */}
      {!introHidden && (
        <Card className="onboarding-card relative mb-5 overflow-hidden p-5">
          <button onClick={dismissIntro} aria-label="Ocultar" className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-fg"><X size={15} /></button>
          <div className="relative">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-brand" />
              <h3 className="text-base font-semibold text-fg">Tu Empleado IA responde con esto</h3>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Políticas de envío y devoluciones, preguntas frecuentes e info de tu marca. Mientras más completo
              esté, mejor y más preciso responde a tus clientes en WhatsApp — sin que tú tengas que estar ahí.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="mr-1 self-center text-xs text-subtle">Empieza con:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex.label} onClick={() => onNew(ex.seed)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition hover:border-brand hover:text-brand">
                  <Plus size={12} /> {ex.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

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
          action={<Button onClick={() => onNew()}><Plus size={15} /> Nuevo documento</Button>}
          tall
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

      {/* Preguntas frecuentes — quick Q&A the Empleado IA answers verbatim */}
      <div className="mt-8">
        <div className="mb-2 flex items-center gap-2">
          <HelpCircle size={16} className="text-subtle" />
          <h2 className="text-sm font-semibold text-fg">Preguntas frecuentes</h2>
        </div>
        <p className="mb-3 text-xs text-muted">Respuestas cortas y directas. El Empleado IA las usa tal cual para responder rápido.</p>
        <Card className="p-4">
          <form onSubmit={addFaq} className="space-y-2">
            <Input value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder="Pregunta, ej. ¿Hacen delivery?" />
            <div className="flex gap-2">
              <Input value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} placeholder="Respuesta" className="flex-1" />
              <Button disabled={!faqForm.question.trim() || !faqForm.answer.trim()}><Plus size={15} /> Agregar</Button>
            </div>
          </form>
          {faqs.length > 0 && (
            <div className="mt-3 divide-y divide-border border-t border-border">
              {faqs.map((f) => (
                <div key={f.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">{f.question}</div>
                    <div className="text-xs text-muted">{f.answer}</div>
                  </div>
                  <button onClick={() => removeFaq(f.id)} title="Eliminar" className="shrink-0 text-subtle transition hover:text-danger"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageBody>
  );
}

/* ---------------------------------------------------------------- Editor */

function EditorView({ doc, seed, collections, onClose, onSaved, onDelete, toast }: {
  doc: Doc | null;
  seed?: Seed;
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (d: Doc) => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const isNew = !doc;
  const [title, setTitle] = useState(doc?.title ?? seed?.title ?? '');
  const [kind, setKind] = useState<Kind>(doc?.kind ?? seed?.kind ?? 'policy');
  const [collectionId, setCollectionId] = useState<string>(doc?.collection_id ? String(doc.collection_id) : '');
  const [summary, setSummary] = useState(doc?.summary ?? seed?.summary ?? '');
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
