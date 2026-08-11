'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes, PackagePlus, History, AlertTriangle, Coins, Layers, Ban, Info,
} from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Button, Badge, EmptyState, StatCard } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import EntryEditor, { type PickableProduct } from '@/components/inventory/EntryEditor';
import StockAdjustSheet, { type AdjustTarget } from '@/components/inventory/StockAdjustSheet';
import { KindBadge, OriginBadge, KIND_LABEL, ORIGIN_LABEL, type StockKind, type StockOrigin } from '@/components/inventory/OriginBadge';

// Inventory lives apart from Catálogo on purpose: Catálogo is what the customer
// (and the AI) sees — name, photo, price. This page is quantities, what came in,
// and who moved it. Keeping them separate is what "separar el seguimiento de
// inventario del de la IA" actually means in the UI.

interface Summary {
  tracked: number; untracked: number; units: number; lowStock: number; outOfStock: number;
  stockValue: number; retailValue: number; threshold: number; linelessSales30d: number;
}
interface Movement {
  id: number; product_id: number | null; product_name: string; kind: StockKind; origin: StockOrigin;
  qty_delta: number; stock_after: number | null; note: string; moved_at: number;
}
interface Entry {
  id: number; supplier: string; note: string; status: 'draft' | 'applied' | 'void';
  total: number; post_expense: number; item_count: number; received_at: number;
}
interface LowStockRow { id: number; name: string; stock: number }

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (epoch: number) => new Date(epoch * 1000).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Tab = 'resumen' | 'entradas' | 'movimientos';
const TABS: { id: Tab; label: string; icon: typeof Boxes }[] = [
  { id: 'resumen', label: 'Resumen', icon: Boxes },
  { id: 'entradas', label: 'Entradas', icon: PackagePlus },
  { id: 'movimientos', label: 'Movimientos', icon: History },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [products, setProducts] = useState<PickableProduct[]>([]);
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [productFilter, setProductFilter] = useState<number | null>(null);

  const load = useCallback(() => {
    api<Summary>('/api/inventory/summary').then(setSummary).catch(() => {});
    api<LowStockRow[]>('/api/inventory/low-stock').then(setLowStock).catch(() => {});
    api<PickableProduct[]>('/api/products').then(setProducts).catch(() => {});
  }, []);
  useEffect(load, [load]);

  // Deep link from the catálogo: /inventory?product=12 opens that product's history.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('product');
    if (id) { setProductFilter(Number(id)); setTab('movimientos'); }
  }, []);

  const filteredName = products.find((p) => p.id === productFilter)?.name;

  return (
    <Shell>
      <div className="mx-auto max-w-5xl p-6 lg:p-8">
        <PageHeader title="Inventario" subtitle="Lo que tienes, lo que entró y quién lo movió." />

        <div className="mb-6 inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
                tab === t.id ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' && (
          <ResumenTab summary={summary} lowStock={lowStock} onAdjust={(row) => setAdjusting({ id: row.id, name: row.name, stock: row.stock })} />
        )}
        {tab === 'entradas' && <EntradasTab products={products} onChanged={load} />}
        {tab === 'movimientos' && (
          <MovimientosTab
            productFilter={productFilter}
            filteredName={filteredName}
            onClearProduct={() => setProductFilter(null)}
          />
        )}

        <StockAdjustSheet product={adjusting} onClose={() => setAdjusting(null)} onSaved={load} />
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------------------- Resumen */

function ResumenTab({ summary, lowStock, onAdjust }: {
  summary: Summary | null;
  lowStock: LowStockRow[];
  onAdjust: (row: LowStockRow) => void;
}) {
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Valorización" value={money(summary?.stockValue ?? 0)} icon={<Coins size={18} />} sub={`venta ${money(summary?.retailValue ?? 0)}`} />
        <StatCard label="Unidades" value={String(summary?.units ?? 0)} icon={<Layers size={18} />} sub={`${summary?.tracked ?? 0} productos con inventario`} />
        <StatCard label="Stock bajo" value={String(summary?.lowStock ?? 0)} icon={<AlertTriangle size={18} />} accent="accent" sub={`${summary?.threshold ?? 3} o menos`} />
        <StatCard label="Agotados" value={String(summary?.outOfStock ?? 0)} icon={<Ban size={18} />} />
      </div>

      {/* The AI closes sales over WhatsApp as a charge, with no products attached,
          so they never move stock. Said out loud rather than quietly guessed at. */}
      {summary && summary.linelessSales30d > 0 && (
        <Card className="mb-6 flex items-start gap-3 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-info" />
          <div className="text-sm">
            <p className="font-medium text-fg">{summary.linelessSales30d} venta{summary.linelessSales30d === 1 ? '' : 's'} por WhatsApp sin productos asignados</p>
            <p className="mt-0.5 text-muted">
              No descontaron stock ni cuentan para tu costo. Asígnales los productos desde Punto de venta
              para que el inventario cuadre.
            </p>
          </div>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-fg">Se está acabando</h2>
      {lowStock.length === 0 ? (
        <EmptyState icon={<Boxes size={24} />} title="Todo con stock" desc="Ningún producto está por debajo del mínimo." />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {lowStock.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</p>
              <Badge tone={p.stock <= 0 ? 'danger' : 'warn'}>{p.stock <= 0 ? 'Agotado' : `Quedan ${p.stock}`}</Badge>
              <Button variant="secondary" size="sm" onClick={() => onAdjust(p)}>Ajustar</Button>
            </div>
          ))}
        </Card>
      )}

      {summary && summary.untracked > 0 && (
        <p className="mt-4 text-xs text-muted">
          {summary.untracked} producto{summary.untracked === 1 ? '' : 's'} sin control de inventario. Actívalo en el catálogo si quieres seguir su stock.
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- Entradas */

function EntradasTab({ products, onChanged }: { products: PickableProduct[]; onChanged: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => { api<Entry[]>('/api/stock/entries').then(setEntries).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function voidEntry(e: Entry) {
    const ok = await confirm({
      title: 'Anular recepción',
      message: `Se descontará el stock que agregó esta recepción de ${money(e.total)}${e.post_expense ? ' y se devolverá el gasto a la caja' : ''}.`,
      confirmLabel: 'Anular', danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/stock/entries/${e.id}/void`, { method: 'POST' });
      toast('Recepción anulada', 'info');
      load(); onChanged();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo anular', 'error');
    }
  }

  if (creating) {
    return (
      <EntryEditor
        products={products}
        onCancel={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); onChanged(); }}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}><PackagePlus size={15} /> Nueva recepción</Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={<PackagePlus size={24} />} title="Sin recepciones" desc="Registra la mercadería que te llega para llevar el costo real." />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {entries.map((e) => (
            <div key={e.id} className={cn('flex items-center gap-3 px-4 py-3', e.status === 'void' && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{e.supplier || 'Sin proveedor'}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {when(e.received_at)} · {e.item_count} producto{e.item_count === 1 ? '' : 's'}{e.note ? ` · ${e.note}` : ''}
                </p>
              </div>
              {e.post_expense === 1 && <Badge tone="neutral">Gasto en caja</Badge>}
              {e.status === 'void'
                ? <Badge tone="danger">Anulada</Badge>
                : <Button variant="ghost" size="sm" onClick={() => voidEntry(e)}>Anular</Button>}
              <span className="tabular w-24 shrink-0 text-right text-sm font-semibold text-fg">{money(e.total)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- Movimientos */

const KINDS: (StockKind | 'all')[] = ['all', 'entry', 'sale', 'void', 'adjustment', 'count', 'import'];
const ORIGINS: (StockOrigin | 'all')[] = ['all', 'dashboard', 'pos', 'ai', 'system'];

function MovimientosTab({ productFilter, filteredName, onClearProduct }: {
  productFilter: number | null;
  filteredName?: string;
  onClearProduct: () => void;
}) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [kind, setKind] = useState<StockKind | 'all'>('all');
  const [origin, setOrigin] = useState<StockOrigin | 'all'>('all');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (kind !== 'all') params.set('kind', kind);
    if (origin !== 'all') params.set('origin', origin);
    if (productFilter) params.set('productId', String(productFilter));
    setLoaded(false);
    api<Movement[]>(`/api/stock/movements?${params}`)
      .then(setMovements).catch(() => setMovements([]))
      .finally(() => setLoaded(true));
  }, [kind, origin, productFilter]);

  const aiFilterEmpty = origin === 'ai' && loaded && movements.length === 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {k === 'all' ? 'Todos' : KIND_LABEL[k]}
          </Chip>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">Origen:</span>
        {ORIGINS.map((o) => (
          <Chip key={o} active={origin === o} onClick={() => setOrigin(o)}>
            {o === 'all' ? 'Todos' : ORIGIN_LABEL[o]}
          </Chip>
        ))}
      </div>

      {productFilter && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span>Mostrando solo <span className="font-medium text-fg">{filteredName ?? `producto #${productFilter}`}</span></span>
          <button onClick={onClearProduct} className="text-brand hover:underline">Ver todos</button>
        </div>
      )}

      {movements.length === 0 ? (
        aiFilterEmpty ? (
          <EmptyState
            icon={<Info size={24} />}
            title="Tu Empleado IA aún no mueve stock"
            desc="Las ventas que cierra por WhatsApp se cobran sin detalle de productos. Asígnaselos desde Punto de venta y aparecerán aquí."
          />
        ) : (
          <EmptyState icon={<History size={24} />} title="Sin movimientos" desc="El historial de movimientos empieza hoy: los cambios anteriores no quedaron registrados." />
        )
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn('tabular w-14 shrink-0 text-sm font-semibold', m.qty_delta > 0 ? 'text-success' : 'text-danger')}>
                {m.qty_delta > 0 ? '+' : ''}{m.qty_delta}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{m.product_name || 'Producto eliminado'}</p>
                <p className="mt-0.5 text-xs text-muted">{when(m.moved_at)}{m.note ? ` · ${m.note}` : ''}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <KindBadge kind={m.kind} />
                <OriginBadge origin={m.origin} />
              </div>
              {m.stock_after !== null && (
                <span className="tabular w-16 shrink-0 text-right text-xs text-muted">quedan {m.stock_after}</span>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition',
        active ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:text-fg')}
    >
      {children}
    </button>
  );
}
