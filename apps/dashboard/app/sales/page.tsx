'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Plus, Minus, Trash2, X, Check, ShoppingCart, Lock, Tag } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, PageBody, Card, Input, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// The register, laid out in the order a sale actually happens: ring the items,
// read the total, pick how they're paying, take the cash, give change. The day's
// numbers sit below the working area — you look at them a few times a day, but
// you sell all day.

interface Product { id: number; name: string; price: number; cost: number | null; sku: string | null; category: string; stock: number | null; track_stock: number; active: number }
interface PayMethod { id: string; label: string; fee_pct: number }
interface Line { productId: number | null; name: string; qty: number; unitPrice: number; unitCost: number | null }
interface Sale { id: number; total: number; net: number; fee_amount: number; payment_method: string; status: string; contact_name: string | null; channel: string; items: { name: string; qty: number; unit_price: number }[] }
interface DaySummary { count: number; gross: number; net: number; fees: number; byMethod: { method: string; total: number; count: number }[] }
interface SessionInfo { day: string; session: { status: 'open' | 'closed' } | null }

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [assigning, setAssigning] = useState<Sale | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  // The cart lives here, not in the panel: the desktop column, the mobile bar and
  // the mobile sheet are three views of one cart. (Two listeners on 'pos-add'
  // would double-add every tap.)
  const [lines, setLines] = useState<Line[]>([]);

  const loadSales = useCallback(() => {
    api<Sale[]>('/api/sales').then(setSales).catch(() => {});
    api<DaySummary>('/api/sales/day-summary').then(setSummary).catch(() => {});
  }, []);
  const loadProducts = useCallback(() => { api<Product[]>('/api/products').then(setProducts).catch(() => {}); }, []);
  const loadSession = useCallback(() => { api<SessionInfo>('/api/cash/session').then(setSession).catch(() => {}); }, []);
  useEffect(() => {
    loadProducts();
    api<PayMethod[]>('/api/sales/payment-methods').then((m) => setMethods(m)).catch(() => {});
    loadSales();
    loadSession();
  }, [loadSales, loadProducts, loadSession]);

  // Refetch when the app returns to the foreground — a PWA frozen overnight and
  // reopened on a new day must re-resolve "hoy" instead of showing yesterday's list.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { loadSales(); loadProducts(); loadSession(); } };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [loadSales, loadProducts, loadSession]);

  // ProductPicker still announces adds over this event, unchanged — only the
  // listener moved up here from the cart panel.
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

  const onRecorded = useCallback(() => { setLines([]); setSheetOpen(false); loadSales(); loadProducts(); }, [loadSales, loadProducts]);

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

  const cartCount = lines.reduce((a, l) => a + l.qty, 0);
  const cartTotal = round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));

  return (
    <Shell>
      {/* Extra room for the mobile cart bar, which sits above the nav bar. */}
      <PageBody className="max-w-6xl p-6 pb-16 lg:p-8 lg:pb-8">
        <PageHeader title="Punto de venta" subtitle="Registra tus ventas del día por efectivo, Yape, Plin o tarjeta." />

        {session && !session.session && (
          <Link
            href="/cashflow?caja=abrir"
            className="mb-6 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/8 px-4 py-2.5 text-sm text-fg transition hover:bg-brand/12"
          >
            <Lock size={15} className="shrink-0 text-brand" />
            <span>Aún no abriste la caja de hoy.</span>
            <span className="ml-auto shrink-0 font-medium text-brand">Abrir caja</span>
          </Link>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ProductPicker products={products} onAdd={(l) => window.dispatchEvent(new CustomEvent('pos-add', { detail: l }))} />
          </div>
          <div className="hidden lg:col-span-2 lg:block">
            <Card className="sticky top-6 flex flex-col p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><ShoppingCart size={16} /> Venta actual</p>
              <CartBody lines={lines} setLines={setLines} methods={methods} onRecorded={onRecorded} toast={toast} />
            </Card>
          </div>
        </div>

        <DayStrip summary={summary} methods={methods} />

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">Ventas de hoy</h2>
          {sales.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={24} />} title="Sin ventas todavía" desc="Registra tu primera venta arriba." />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {sales.map((s) => {
                const lineless = s.items.length === 0;
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {!lineless ? s.items.map((i) => `${i.qty}× ${i.name}`).join(', ') : (s.channel === 'whatsapp' ? 'Cobro WhatsApp' : 'Venta')}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{s.contact_name ? `${s.contact_name} · ` : ''}{methods.find((m) => m.id === s.payment_method)?.label ?? s.payment_method}</p>
                    </div>
                    {s.channel === 'whatsapp' && <Badge tone="neutral">WhatsApp</Badge>}
                    {/* A lineless sale never touched stock. Offer the fix instead of guessing. */}
                    {lineless && s.status !== 'void' && (
                      <Button variant="ghost" size="sm" onClick={() => setAssigning(s)} title="Esta venta no descontó stock">
                        <Tag size={14} /> Asignar productos
                      </Button>
                    )}
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
      </PageBody>

      <MobileCartBar count={cartCount} total={cartTotal} onOpen={() => setSheetOpen(true)} />
      <CartSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <CartBody lines={lines} setLines={setLines} methods={methods} onRecorded={onRecorded} toast={toast} />
      </CartSheet>

      <AssignItemsModal
        sale={assigning}
        products={products}
        onClose={() => setAssigning(null)}
        onSaved={() => { setAssigning(null); loadSales(); loadProducts(); }}
      />
    </Shell>
  );
}

/* --------------------------------------------------------------- Day KPI strip */

// Below the register on purpose: read a few times a day, not 200 times.
function DayStrip({ summary, methods }: { summary: DaySummary | null; methods: PayMethod[] }) {
  if (!summary) return null;
  const cells: { label: string; value: string; sub?: string }[] = [
    { label: 'Ventas de hoy', value: money(summary.gross), sub: `${summary.count} venta${summary.count === 1 ? '' : 's'}` },
    { label: 'Neto', value: money(summary.net), sub: summary.fees > 0 ? `comisiones ${money(summary.fees)}` : undefined },
    ...summary.byMethod.slice(0, 3).map((m) => ({
      label: methods.find((x) => x.id === m.method)?.label ?? m.method,
      value: money(m.total),
      sub: `${m.count} venta${m.count === 1 ? '' : 's'}`,
    })),
  ];
  return (
    <Card className="mt-6 overflow-x-auto">
      <div className="flex min-w-max items-stretch divide-x divide-border">
        {cells.map((c) => (
          <div key={c.label} className="min-w-[8.5rem] px-4 py-3">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="tabular mt-0.5 text-lg font-semibold text-fg">{c.value}</p>
            {c.sub && <p className="mt-0.5 text-[11px] text-subtle">{c.sub}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- Mobile cart bar */

function MobileCartBar({ count, total, onOpen }: { count: number; total: number; onOpen: () => void }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          // Sits just above the floating nav pill — see --nav-* in globals.css.
          className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--nav-inset)+0.5rem)] z-30 px-3 lg:hidden"
        >
          <button
            onClick={onOpen}
            className="flex w-full items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-white shadow-[var(--shadow-card)] transition active:scale-[.99]"
          >
            <ShoppingCart size={18} className="shrink-0" />
            <span className="text-sm font-medium">{count} artículo{count === 1 ? '' : 's'}</span>
            <span className="tabular ml-auto text-base font-semibold">{money(total)}</span>
            <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold">Cobrar</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CartSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
          >
            <div className="mx-auto -mt-1 mb-3 flex h-6 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border-strong" />
            </div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><ShoppingCart size={16} /> Venta actual</p>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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

/* ------------------------------------------------------------------ Cart body */

function CartBody({ lines, setLines, methods, onRecorded, toast }: {
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  methods: PayMethod[];
  onRecorded: () => void;
  toast: (m: string, t?: 'success' | 'info' | 'error') => void;
}) {
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (methods.length && !methods.find((m) => m.id === method)) setMethod(methods[0].id); }, [methods, method]);

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
      setDiscount(''); setShowDiscount(false); setCashReceived('');
      onRecorded();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo registrar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
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

      {/* 1. The total, before anything else — it's the number you say out loud. */}
      <div className="border-t border-border pt-3">
        {disc > 0 && (
          <>
            <div className="flex justify-between text-sm text-muted"><span>Subtotal</span><span className="tabular">{money(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-muted"><span>Descuento</span><span className="tabular">−{money(disc)}</span></div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="tabular text-2xl font-semibold text-fg">{money(total)}</span>
        </div>
        {!showDiscount ? (
          <button onClick={() => setShowDiscount(true)} className="mt-1 text-xs text-muted hover:text-fg">+ Aplicar descuento</button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <label className="w-20 text-xs text-muted">Descuento</label>
            <Input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="py-2" autoFocus />
          </div>
        )}
      </div>

      {/* 2. Then how they're paying. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
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

      {/* 3. Cash in, change out. */}
      {method === 'cash' && total > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <label className="w-20 text-xs text-muted">Recibido</label>
          <Input value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="py-2" />
        </div>
      )}
      {change !== null && change >= 0 && (
        <div className="mt-2 flex items-baseline justify-between rounded-lg bg-brand/8 px-3 py-2">
          <span className="text-sm text-brand">Vuelto</span>
          <span className="tabular text-lg font-semibold text-brand">{money(change)}</span>
        </div>
      )}
      {fee > 0 && <p className="mt-2 text-xs text-muted">Comisión {feePct}%: −{money(fee)} · neto {money(net)}</p>}

      {/* 4. Cobrar. */}
      <Button onClick={record} disabled={lines.length === 0 || saving} className="mt-3 w-full">
        <Check size={16} /> {saving ? 'Registrando…' : `Cobrar ${money(total)}`}
      </Button>
    </>
  );
}

/* ------------------------------------------------- Assign products to a sale */

// WhatsApp/AI charges become sales with no products attached: real money, but no
// stock moved and no cost recorded. Rather than guessing what was sold, this asks.
function AssignItemsModal({ sale, products, onClose, onSaved }: {
  sale: Sale | null;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { setPicked([]); setQ(''); }, [sale?.id]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return products.filter((p) => p.active && `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(needle)).slice(0, 6);
  }, [products, q]);

  const total = round2(picked.reduce((a, l) => a + l.qty * l.unitPrice, 0));

  async function save() {
    if (!sale || picked.length === 0 || saving) return;
    setSaving(true);
    try {
      await api(`/api/sales/${sale.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ items: picked.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, unitCost: l.unitCost })) }),
      });
      toast('Productos asignados · stock descontado', 'success');
      onSaved();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo asignar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={sale !== null} onClose={onClose} title="Asignar productos a la venta">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Esta venta de <span className="tabular font-medium text-fg">{money(sale?.total ?? 0)}</span> se cobró por WhatsApp sin detalle.
          Indica qué se entregó para descontar el stock.
        </p>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="pl-10" />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setQ('');
                    setPicked((prev) => prev.some((l) => l.productId === p.id)
                      ? prev
                      : [...prev, { productId: p.id, name: p.name, qty: 1, unitPrice: p.price, unitCost: p.cost }]);
                  }}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="truncate text-fg">{p.name}</span>
                  <span className="tabular ml-3 shrink-0 text-xs text-muted">{money(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {picked.length > 0 && (
          <div className="space-y-2">
            {picked.map((l, i) => (
              <div key={l.productId ?? i} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2">
                <p className="min-w-0 flex-1 truncate text-sm text-fg">{l.name}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPicked((prev) => prev.flatMap((x, idx) => idx === i ? (x.qty <= 1 ? [] : [{ ...x, qty: x.qty - 1 }]) : [x]))}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg"><Minus size={13} /></button>
                  <span className="tabular w-6 text-center text-sm">{l.qty}</span>
                  <button onClick={() => setPicked((prev) => prev.map((x, idx) => idx === i ? { ...x, qty: x.qty + 1 } : x))}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg"><Plus size={13} /></button>
                </div>
                <span className="tabular w-16 text-right text-sm font-medium text-fg">{money(l.qty * l.unitPrice)}</span>
              </div>
            ))}
            {sale && Math.abs(total - sale.total) > 0.01 && (
              <p className="text-xs text-muted">
                Los productos suman {money(total)} y la venta fue {money(sale.total)}. El monto cobrado no cambia — solo se registra qué salió del inventario.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={picked.length === 0 || saving}>{saving ? 'Guardando…' : 'Asignar y descontar'}</Button>
        </div>
      </div>
    </Modal>
  );
}
