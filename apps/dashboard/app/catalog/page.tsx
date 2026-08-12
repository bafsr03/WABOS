'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Search, ArrowUpDown, ImagePlus, ImageIcon, ChevronRight, ShoppingBag, Check,
  Download, Upload, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api, apiDownload, importProductsCsv, uploadProductImage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, PageBody, Card, Input, Textarea, Field, Button, Badge, EmptyState, Switch } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import StockAdjustSheet, { type AdjustTarget } from '@/components/inventory/StockAdjustSheet';

interface Product { id: number; name: string; description: string; price: number; currency: string; cost: number | null; sku: string | null; category: string; active: number; stock: number | null; track_stock: number; image_path: string | null }

const isOutOfStock = (p: Product) => p.track_stock === 1 && (p.stock ?? 0) <= 0;
// Matches the engine's default; the real threshold is the
// `inventory_low_stock_threshold` setting, which Inventario reads.
const LOW_STOCK_AT = 3;
const isLowStock = (p: Product) => p.track_stock === 1 && (p.stock ?? 0) > 0 && (p.stock ?? 0) <= LOW_STOCK_AT;

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
          onChanged={load}
          toast={toast}
        />
      ) : (
        <EditorView
          product={view.product}
          categories={Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b))}
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

function ListView({ products, onNew, onOpen, onDelete, onChanged, toast }: {
  products: Product[];
  onNew: () => void;
  onOpen: (p: Product) => void;
  onDelete: (p: Product) => void;
  onChanged: () => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<SortId>('recent');
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  async function onExport() {
    try { await apiDownload('/api/products/export.csv', 'inventario.csv'); }
    catch (err: any) { toast(err.message ?? 'No se pudo exportar', 'error'); }
  }
  async function onTemplate() {
    try { await apiDownload('/api/products/template.csv', 'plantilla-inventario.csv'); }
    catch (err: any) { toast(err.message ?? 'No se pudo descargar la plantilla', 'error'); }
  }
  async function onImportFile(file: File) {
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await importProductsCsv(csv);
      const parts = [];
      if (res.created) parts.push(`${res.created} nuevos`);
      if (res.updated) parts.push(`${res.updated} actualizados`);
      const summary = parts.length ? parts.join(', ') : 'Sin cambios';
      if (res.errors.length) {
        toast(`${summary}. ${res.errors.length} fila(s) con error (ej. fila ${res.errors[0].row}: ${res.errors[0].message})`, 'error');
      } else {
        toast(`Inventario importado: ${summary}`, 'success');
      }
      onChanged();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo importar el archivo', 'error');
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = '';
    }
  }

  const counts = useMemo(() => ({
    all: products.length,
    active: products.filter((p) => p.active).length,
    draft: products.filter((p) => !p.active).length,
  }), [products]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = products.filter((p) => {
      if (filter === 'active' && !p.active) return false;
      if (filter === 'draft' && p.active) return false;
      if (cat !== 'all' && p.category !== cat) return false;
      if (needle && !(`${p.name} ${p.description} ${p.category}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    list = [...list];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, q, filter, cat, sort]);

  const cycleSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length].id);

  return (
    <PageBody className="max-w-4xl p-6 lg:p-8">
      <PageHeader
        title="Catálogo"
        subtitle="El Empleado IA usa este catálogo para responder y recomendar."
        actions={<Button onClick={onNew}><Plus size={15} /> Nuevo producto</Button>}
      />

      {/* Bulk import / export */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          ref={importInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); }}
        />
        <Button variant="secondary" size="sm" onClick={() => importInput.current?.click()} disabled={importing}>
          {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {importing ? 'Importando…' : 'Importar CSV'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onTemplate}><Download size={15} /> Descargar plantilla</Button>
        <Button variant="ghost" size="sm" onClick={onExport} disabled={products.length === 0}><Download size={15} /> Exportar</Button>
      </div>

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

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="-mx-1 mb-4 flex flex-wrap gap-1.5 px-1">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                cat === c ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:text-fg',
              )}
            >
              {c === 'all' ? 'Todas las categorías' : c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={24} />}
          title={products.length === 0 ? 'Catálogo vacío' : 'Sin resultados'}
          desc={products.length === 0 ? 'Agrega tu primer producto para empezar.' : 'Prueba con otra búsqueda o filtro.'}
          action={products.length === 0 ? <Button onClick={onNew}><Plus size={15} /> Nuevo producto</Button> : undefined}
          tall
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
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-2 text-subtle">
                {p.image_path
                  ? <img src={p.image_path} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  : <ImageIcon size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('line-clamp-2 text-sm font-medium text-fg', !p.active && 'opacity-60')}>{p.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {p.category && <span className="mr-1.5 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-subtle">{p.category}</span>}
                  {p.description || money(p)}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {isOutOfStock(p) ? <Badge tone="danger">Agotado</Badge>
                  : isLowStock(p) ? <Badge tone="warn">Quedan {p.stock}</Badge>
                  : p.track_stock === 1 ? <Badge tone="neutral">{p.stock} en stock</Badge> : null}
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
    </PageBody>
  );
}

/* ---------------------------------------------------------------- Editor */

function EditorView({ product, categories, onClose, onSaved, onDelete, toast }: {
  product: Product | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (p: Product) => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [active, setActive] = useState(product ? !!product.active : true);
  const [trackStock, setTrackStock] = useState(product ? product.track_stock === 1 : false);
  const [stock, setStock] = useState(product?.stock != null ? String(product.stock) : '');
  const [image, setImage] = useState<string | null>(product?.image_path ?? null);
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [uploading, setUploading] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isNew = !product;

  async function onPickImage(file: File) {
    if (isNew || !product) { toast('Guarda el producto primero para agregar una foto', 'info'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('La imagen supera 5 MB', 'error'); return; }
    setUploading(true);
    try {
      const res = await uploadProductImage(product.id, file);
      setImage(res.imagePath);
      toast('Imagen actualizada', 'success');
    } catch (err: any) {
      toast(err.message ?? 'No se pudo subir la imagen', 'error');
    } finally {
      setUploading(false);
      if (imgInput.current) imgInput.current.value = '';
    }
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      // Only a brand-new product sets stock from here; for an existing one the
      // quantity moves through Ajustar stock so the history stays complete.
      const stockPayload = isNew
        ? { trackStock, stock: trackStock ? Math.max(0, Math.floor(Number(stock) || 0)) : null }
        : { trackStock };
      const costPayload = { cost: cost.trim() === '' ? null : Math.max(0, Number(cost) || 0), sku: sku.trim() || null, category: category.trim() };
      if (isNew) {
        await api('/api/products', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), description: description.trim(), price: Number(price) || 0, ...costPayload, ...stockPayload }),
        });
        toast('Producto agregado', 'success');
      } else {
        await api(`/api/products/${product!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), description: description.trim(), price: Number(price) || 0, active, ...costPayload, ...stockPayload }),
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

        {/* Media */}
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-fg">Foto del producto</p>
          <input
            ref={imgInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f); }}
          />
          {image ? (
            <div className="flex items-center gap-4">
              <img src={image} alt={name || 'Producto'} className="h-24 w-24 shrink-0 rounded-xl border border-border object-cover" />
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="sm" onClick={() => imgInput.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                  {uploading ? 'Subiendo…' : 'Cambiar foto'}
                </Button>
                <p className="text-xs text-subtle">PNG, JPG o WEBP · máx. 5 MB</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (isNew ? toast('Guarda el producto primero para agregar una foto', 'info') : imgInput.current?.click())}
              disabled={uploading}
              className="grid w-full place-items-center gap-2 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center transition hover:border-brand disabled:opacity-60"
            >
              {uploading ? <Loader2 size={26} className="animate-spin text-subtle" /> : <ImagePlus size={26} className="text-subtle" />}
              <span className="text-sm font-medium text-brand">{uploading ? 'Subiendo…' : 'Agregar foto'}</span>
              <span className="text-xs text-subtle">{isNew ? 'Guarda el producto primero' : 'PNG, JPG o WEBP · máx. 5 MB'}</span>
            </button>
          )}
        </Card>

        {/* Detalles */}
        <Card className="space-y-4 p-4">
          <Field label="Título del producto">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Polo oversize algodón" autoFocus />
          </Field>
          <Field label="Descripción" hint="Tallas, colores, materiales…">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe tu producto para que el Empleado IA lo recomiende mejor." />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Precio">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">S/</span>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="pl-9" />
              </div>
            </Field>
            <Field label="Costo">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">S/</span>
                <Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="pl-9" />
              </div>
              <p className="mt-1 text-xs text-subtle">Para calcular tu ganancia.</p>
            </Field>
          </div>
          {Number(price) > 0 && Number(cost) > 0 && (
            <p className="text-xs text-muted">Ganancia por unidad: <span className="font-medium text-success">S/ {(Number(price) - Number(cost)).toFixed(2)}</span> ({Math.round(((Number(price) - Number(cost)) / Number(price)) * 100)}% margen)</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría" hint="Opcional — agrupa y filtra en catálogo y venta.">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej. Polos" list="catalog-categories" />
              <datalist id="catalog-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <Field label="SKU / código" hint="Opcional — para buscar rápido en el punto de venta.">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej. POL-001" />
            </Field>
          </div>
        </Card>

        {/* Inventario */}
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg">Controlar inventario</p>
              <p className="mt-0.5 text-xs text-muted">Cuando el stock llega a 0, el Empleado IA deja de ofrecer este producto.</p>
            </div>
            <Switch checked={trackStock} onChange={setTrackStock} label="Inventario" />
          </div>
          {trackStock && (isNew ? (
            <Field label="Stock inicial" hint="Unidades con las que empiezas.">
              <Input value={stock} onChange={(e) => setStock(e.target.value)} type="number" step="1" min="0" placeholder="0" />
            </Field>
          ) : (
            // Quantities are owned by Inventario, so every change lands in the
            // movement history instead of being silently overwritten here.
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
              <div>
                <p className="text-sm text-fg">Stock actual: <span className="tabular font-semibold">{product!.stock ?? 0}</span></p>
                <Link href={`/inventory?product=${product!.id}`} className="text-xs text-brand hover:underline">Ver movimientos</Link>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setAdjusting({ id: product!.id, name: product!.name, stock: product!.stock })}>
                Ajustar stock
              </Button>
            </div>
          ))}
        </Card>

        <StockAdjustSheet product={adjusting} onClose={() => setAdjusting(null)} onSaved={onSaved} />

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
