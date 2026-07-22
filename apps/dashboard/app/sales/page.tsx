'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Minus, Trash2, Receipt, X, Check, ShoppingCart } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Input, Button, Badge, EmptyState, StatCard } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Product { id: number; name: string; price: number; cost: number | null; sku: string | null; category: string; stock: number | null; track_stock: number; active: number }
interface PayMethod { id: string; label: string; fee_pct: number }
interface Line { productId: number | null; name: string; qty: number; unitPrice: number; unitCost: number | null }
interface Sale { id: number; total: number; net: number; fee_amount: number; payment_method: string; status: string; contact_name: string | null; channel: string; items: { name: string; qty: number; unit_price: number }[] }
interface DaySummary { count: number; gross: number; net: number; fees: number; byMethod: { method: string; total: number; count: number }[] }

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const loadSales = useCallback(() => {
    api<Sale[]>('/api/sales').then(setSales).catch(() => {});
    api<DaySummary>('/api/sales/day-summary').then(setSummary).catch(() => {});
  }, []);
  const loadProducts = useCallback(() => { api<Product[]>('/api/products').then(setProducts).catch(() => {}); }, []);
  useEffect(() => {
    loadProducts();
    api<PayMethod[]>('/api/sales/payment-methods').then((m) => setMethods(m)).catch(() => {});
    loadSales();
  }, [loadSales, loadProducts]);

  // Refetch when the app returns to the foreground — a PWA frozen overnight and
  // reopened on a new day must re-resolve "hoy" instead of showing yesterday's list.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { loadSales(); loadProducts(); } };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [loadSales, loadProducts]);

  async function voidSale(s: Sale) {
    if (!(await confirm({ title: 'Anular venta', message: `Se anulará la venta de ${money(s.total)} y se devolverá el stock.`, confirmLabel: 'Anular', danger: true }))) return;
    await api(`/api/sales/${s.id}/void`, { method: 'POST' });
    toast('Venta anulada', 'info');
    loadSales();
    loadProducts();
  }

  async function deleteSale(s: Sale) {
    try {
      await api(`/api/sales/${s.id}`, { method: 'DELETE' });
      toast('Venta eliminada', 'info');
      loadSales();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo eliminar', 'error');
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        <PageHeader title="Punto de venta" subtitle="Registra tus ventas del día por efectivo, Yape, Plin o tarjeta." />

        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Ventas de hoy" value={money(summary.gross)} icon={<Receipt size={18} />} sub={`${summary.count} venta${summary.count === 1 ? '' : 's'}`} />
            <StatCard label="Neto" value={money(summary.net)} icon={<Check size={18} />} accent="accent" sub={`comisiones ${money(summary.fees)}`} />
            {summary.byMethod.slice(0, 2).map((m) => (
              <StatCard key={m.method} label={methods.find((x) => x.id === m.method)?.label ?? m.method} value={money(m.total)} sub={`${m.count} venta${m.count === 1 ? '' : 's'}`} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3"><ProductPicker products={products} onAdd={(l) => window.dispatchEvent(new CustomEvent('pos-add', { detail: l }))} /></div>
          <div className="lg:col-span-2"><CartPanel methods={methods} onRecorded={() => { loadSales(); loadProducts(); }} toast={toast} /></div>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">Ventas de hoy</h2>
          {sales.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={24} />} title="Sin ventas todavía" desc="Registra tu primera venta arriba." />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {sales.map((s) => {
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {s.items.length > 0 ? s.items.map((i) => `${i.qty}× ${i.name}`).join(', ') : (s.channel === 'whatsapp' ? 'Cobro WhatsApp' : 'Venta')}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{s.contact_name ? `${s.contact_name} · ` : ''}{methods.find((m) => m.id === s.payment_method)?.label ?? s.payment_method}</p>
                    </div>
                    {s.channel === 'whatsapp' && <Badge tone="neutral">WhatsApp</Badge>}
                    {s.status === 'void' ? <Badge tone="danger">Anulada</Badge> : (
                      <button onClick={() => voidSale(s)} title="Anular" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-danger/12 hover:text-danger"><X size={15} /></button>
                    )}
                    <div className="w-24 shrink-0 text-right">
                      <p className="tabular text-sm font-semibold text-fg">{money(s.total)}</p>
                      {s.fee_amount > 0 && <p className="tabular text-xs text-muted">neto {money(s.net)}</p>}
                    </div>
                  </>
                );
                if (s.status !== 'void') {
                  return <div key={s.id} className="flex items-center gap-4 px-4 py-3">{inner}</div>;
                }
                // Voided sales: swipe left to reveal a "Eliminar" button, then tap it to hard-delete.
                return <VoidSaleRow key={s.id} onDelete={() => deleteSale(s)}>{inner}</VoidSaleRow>;
              })}
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------ Void sale row */

// A voided sale row: swipe left to reveal the "Eliminar" button, tap it to delete.
// Deletion is deliberately a two-step (swipe → tap) so it never fires by accident.
const REVEAL = 104;
function VoidSaleRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative overflow-hidden">
      <button
        onClick={onDelete}
        aria-label="Eliminar"
        className="absolute inset-y-0 right-0 flex items-center gap-1.5 bg-danger px-5 text-sm font-medium text-white"
      >
        <Trash2 size={16} /> Eliminar
      </button>
      <motion.div
        drag="x"
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={0.06}
        animate={{ x: open ? -REVEAL : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 42 }}
        onDragEnd={(_, info) => setOpen(info.offset.x < -REVEAL / 2)}
        className="relative flex cursor-grab items-center bg-surface px-4 py-3 active:cursor-grabbing"
      >
        {/* Dim only the content (bg stays opaque so the red button never bleeds through). */}
        <div className="flex flex-1 items-center gap-4 opacity-60">{children}</div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------- Product picker */

function ProductPicker({ products, onAdd }: { products: Product[]; onAdd: (l: Line) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [flashId, setFlashId] = useState<number | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.filter((p) => p.active).map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => p.active
      && (cat === 'all' || p.category === cat)
      && (!needle || `${p.name} ${p.sku ?? ''} ${p.category}`.toLowerCase().includes(needle)));
  }, [products, q, cat]);

  const isOut = (p: Product) => p.track_stock === 1 && (p.stock ?? 0) <= 0;

  // Brief visual "selected" pulse on the tapped tile so it's clear it went to the cart.
  function pick(p: Product) {
    onAdd({ productId: p.id, name: p.name, qty: 1, unitPrice: p.price, unitCost: p.cost });
    setFlashId(p.id);
    window.setTimeout(() => setFlashId((cur) => (cur === p.id ? null : cur)), 450);
  }

  return (
    <Card className="p-4">
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o SKU…" className="pl-10" autoFocus />
      </div>
      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition',
                cat === c ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:text-fg')}
            >
              {c === 'all' ? 'Todas' : c}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Sin productos. Agrégalos en Catálogo.</p>
      ) : (
        <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {shown.map((p) => (
            <button
              key={p.id}
              disabled={isOut(p)}
              onClick={() => pick(p)}
              className={cn(
                'relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                flashId === p.id
                  ? 'scale-[.97] border-brand bg-brand/10 ring-2 ring-brand/60'
                  : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
              )}
            >
              <span className="line-clamp-2 text-sm font-medium text-fg">{p.name}</span>
              <span className="tabular text-xs text-brand">{money(p.price)}</span>
              {p.track_stock === 1 && <span className="text-[11px] text-subtle">{isOut(p) ? 'Agotado' : `${p.stock} en stock`}</span>}
              {flashId === p.id && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">+1</span>
              )}
            </button>
          ))}
        </div>
      )}
      <CustomLineAdder onAdd={onAdd} />
    </Card>
  );
}

// Ad-hoc line (a service, or an item not in the catalog) — makes the register work for any business.
function CustomLineAdder({ onAdd }: { onAdd: (l: Line) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  return (
    <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
      <div className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Concepto libre (ej. Servicio)" /></div>
      <div className="w-28"><Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.1" min="0" placeholder="Precio" /></div>
      <Button variant="secondary" onClick={() => { if (name.trim() && Number(price) > 0) { onAdd({ productId: null, name: name.trim(), qty: 1, unitPrice: Number(price), unitCost: null }); setName(''); setPrice(''); } }}>
        <Plus size={15} /> Añadir
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- Cart panel */

function CartPanel({ methods, onRecorded, toast }: { methods: PayMethod[]; onRecorded: () => void; toast: (m: string, t?: 'success' | 'info' | 'error') => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (methods.length && !methods.find((m) => m.id === method)) setMethod(methods[0].id); }, [methods, method]);

  useEffect(() => {
    const handler = (e: Event) => {
      const l = (e as CustomEvent<Line>).detail;
      setLines((prev) => {
        const key = l.productId ?? `c:${l.name}`;
        const idx = prev.findIndex((x) => (x.productId ?? `c:${x.name}`) === key);
        if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
        return [...prev, l];
      });
    };
    window.addEventListener('pos-add', handler);
    return () => window.removeEventListener('pos-add', handler);
  }, []);

  const setQty = (i: number, delta: number) => setLines((prev) => prev.flatMap((l, idx) => {
    if (idx !== i) return [l];
    const qty = l.qty + delta;
    return qty <= 0 ? [] : [{ ...l, qty }];
  }));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
  const disc = round2(Math.min(subtotal, Number(discount) || 0));
  const total = round2(subtotal - disc);
  const feePct = methods.find((m) => m.id === method)?.fee_pct ?? 0;
  const fee = round2(total * feePct / 100);
  const net = round2(total - fee);
  const change = method === 'cash' && cashReceived ? round2(Number(cashReceived) - total) : null;

  async function record() {
    if (lines.length === 0 || saving) return;
    setSaving(true);
    try {
      await api('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, unitCost: l.unitCost })),
          paymentMethod: method,
          discount: disc || undefined,
        }),
      });
      toast('Venta registrada', 'success');
      setLines([]); setDiscount(''); setCashReceived('');
      onRecorded();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo registrar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Card className="sticky top-6 flex flex-col p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><ShoppingCart size={16} /> Venta actual</p>
      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Toca productos para agregarlos.</p>
      ) : (
        <div className="mb-3 max-h-[32vh] space-y-2 overflow-y-auto">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{l.name}</p>
                <p className="tabular text-xs text-muted">{money(l.unitPrice)} c/u</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setQty(i, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg"><Minus size={13} /></button>
                <span className="tabular w-6 text-center text-sm font-medium">{l.qty}</span>
                <button onClick={() => setQty(i, +1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg"><Plus size={13} /></button>
              </div>
              <span className="tabular w-16 text-right text-sm font-semibold text-fg">{money(l.qty * l.unitPrice)}</span>
              <button onClick={() => removeLine(i)} className="grid h-7 w-7 place-items-center rounded-md text-subtle hover:text-danger"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Payment methods */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition', method === m.id ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:text-fg')}
          >
            {m.label}{m.fee_pct > 0 && <span className="ml-1 text-[11px] opacity-70">{m.fee_pct}%</span>}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="w-20 text-xs text-muted">Descuento</label>
        <Input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="py-2" />
      </div>
      {method === 'cash' && total > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="w-20 text-xs text-muted">Recibido</label>
          <Input value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="py-2" />
        </div>
      )}

      {/* Totals */}
      <div className="mb-3 space-y-1 border-t border-border pt-3 text-sm">
        {disc > 0 && <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular">{money(subtotal)}</span></div>}
        {disc > 0 && <div className="flex justify-between text-muted"><span>Descuento</span><span className="tabular">−{money(disc)}</span></div>}
        <div className="flex justify-between text-base font-semibold text-fg"><span>Total</span><span className="tabular">{money(total)}</span></div>
        {fee > 0 && <div className="flex justify-between text-xs text-muted"><span>Comisión {feePct}%</span><span className="tabular">−{money(fee)} · neto {money(net)}</span></div>}
        {change !== null && change >= 0 && <div className="flex justify-between text-sm text-brand"><span>Vuelto</span><span className="tabular">{money(change)}</span></div>}
      </div>

      <Button onClick={record} disabled={lines.length === 0 || saving} className="w-full">
        <Check size={16} /> {saving ? 'Registrando…' : `Cobrar ${money(total)}`}
      </Button>
    </Card>
  );
}
