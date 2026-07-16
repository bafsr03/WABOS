'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Search, ArrowUpDown, ImagePlus, ImageIcon, ChevronRight, ShoppingBag, Check,
} from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Input, Textarea, Field, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Product { id: number; name: string; description: string; price: number; currency: string; active: number }

type View = { mode: 'list' } | { mode: 'edit'; product: Product | null };
type FilterId = 'all' | 'active' | 'draft';
type SortId = 'recent' | 'name' | 'price';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'draft', label: 'Borradores' },
];
const SORTS: { id: SortId; label: string }[] = [
  { id: 'recent', label: 'Recientes' },
  { id: 'name', label: 'Nombre' },
  { id: 'price', label: 'Precio' },
];

const money = (p: Product) => `${p.currency === 'PEN' ? 'S/' : p.currency} ${p.price.toFixed(2)}`;

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<View>({ mode: 'list' });
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => { api<Product[]>('/api/products').then(setProducts).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function remove(p: Product, back = false) {
    if (!(await confirm({ title: 'Eliminar producto', message: `Se quitará "${p.name}" del catálogo.`, confirmLabel: 'Eliminar', danger: true }))) return;
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    toast('Producto eliminado', 'info');
    load();
    if (back) setView({ mode: 'list' });
  }

  return (
    <Shell>
      {view.mode === 'list' ? (
        <ListView
          products={products}
          onNew={() => setView({ mode: 'edit', product: null })}
          onOpen={(p) => setView({ mode: 'edit', product: p })}
          onDelete={(p) => remove(p)}
        />
      ) : (
        <EditorView
          product={view.product}
          onClose={() => setView({ mode: 'list' })}
          onSaved={() => { load(); setView({ mode: 'list' }); }}
          onDelete={(p) => remove(p, true)}
          toast={toast}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ List */

function ListView({ products, onNew, onOpen, onDelete }: {
  products: Product[];
  onNew: () => void;
  onOpen: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('recent');

  const counts = useMemo(() => ({
    all: products.length,
    active: products.filter((p) => p.active).length,
    draft: products.filter((p) => !p.active).length,
  }), [products]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = products.filter((p) => {
      if (filter === 'active' && !p.active) return false;
      if (filter === 'draft' && p.active) return false;
      if (needle && !(`${p.name} ${p.description}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    list = [...list];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, q, filter, sort]);

  const cycleSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length].id);

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <PageHeader
        title="Catálogo"
        subtitle="El Empleado IA usa este catálogo para responder y recomendar."
        actions={<Button onClick={onNew}><Plus size={15} /> Nuevo producto</Button>}
      />

      {/* Search + sort */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos…" className="pl-10" />
        </div>
        <button
          onClick={cycleSort}
          title={`Ordenar: ${SORTS.find((s) => s.id === sort)!.label}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-muted transition hover:border-border-strong hover:text-fg"
        >
          <ArrowUpDown size={15} />
          <span className="hidden sm:inline">{SORTS.find((s) => s.id === sort)!.label}</span>
        </button>
      </div>

      {/* Segmented tabs */}
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                  active ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg',
                )}
              >
                {f.label}
                <span className={cn('tabular rounded-full px-1.5 text-xs', active ? 'bg-surface-3 text-muted' : 'text-subtle')}>
                  {counts[f.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={24} />}
          title={products.length === 0 ? 'Catálogo vacío' : 'Sin resultados'}
          desc={products.length === 0 ? 'Agrega tu primer producto para empezar.' : 'Prueba con otra búsqueda o filtro.'}
          action={products.length === 0 ? <Button onClick={onNew}><Plus size={15} /> Nuevo producto</Button> : undefined}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {shown.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(p)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}
              className="group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-subtle">
                <ImageIcon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('line-clamp-2 text-sm font-medium text-fg', !p.active && 'opacity-60')}>{p.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{p.description || money(p)}</p>
              </div>
              <div className="hidden shrink-0 sm:block">
                <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Activo' : 'Borrador'}</Badge>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                title="Eliminar"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle opacity-0 transition hover:bg-danger/12 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
              <ChevronRight size={16} className="shrink-0 text-subtle" />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Editor */

function EditorView({ product, onClose, onSaved, onDelete, toast }: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (p: Product) => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [active, setActive] = useState(product ? !!product.active : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isNew = !product;

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        await api('/api/products', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), description: description.trim(), price: Number(price) || 0 }),
        });
        toast('Producto agregado', 'success');
      } else {
        await api(`/api/products/${product!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), description: description.trim(), price: Number(price) || 0, active }),
        });
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
      {/* Sticky Cancel / Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur lg:px-8">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <span className="truncate text-sm font-medium text-fg">{isNew ? 'Nuevo producto' : 'Editar producto'}</span>
        <Button size="sm" onClick={save} disabled={!name.trim() || saving}>
          <Check size={15} /> {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      <div className="space-y-5 p-6 lg:p-8">
        {/* Estado */}
        <Card className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-fg">Estado del producto</p>
            <p className="mt-0.5 text-xs text-muted">Los borradores no se muestran a tus clientes.</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {[{ v: true, l: 'Activo' }, { v: false, l: 'Borrador' }].map((o) => (
              <button
                key={o.l}
                onClick={() => setActive(o.v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  active === o.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg',
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Card>

        {/* Media (decorativo) */}
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-fg">Media</p>
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
            <ImagePlus size={26} className="text-subtle" />
            <p className="text-sm font-medium text-brand">Agregar imágenes</p>
            <p className="text-xs text-subtle">Próximamente — carga de fotos de producto</p>
          </div>
        </Card>

        {/* Detalles */}
        <Card className="space-y-4 p-4">
          <Field label="Título del producto">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Polo oversize algodón" autoFocus />
          </Field>
          <Field label="Descripción" hint="Tallas, colores, materiales…">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe tu producto para que el Empleado IA lo recomiende mejor." />
          </Field>
          <Field label="Precio">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">S/</span>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="pl-9" />
            </div>
          </Field>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        {!isNew && (
          <Button variant="danger" className="w-full" onClick={() => onDelete(product!)}>
            <Trash2 size={15} /> Eliminar producto
          </Button>
        )}
      </div>
    </div>
  );
}
