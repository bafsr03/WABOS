'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, PackagePlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Input, Button, Field, Switch, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';

// Recepción de mercadería: what came in, from whom, and what it cost. The cost
// matters — it's what finally makes margin real instead of whatever was typed
// into the catalog once.

export interface PickableProduct { id: number; name: string; sku: string | null; category: string; cost: number | null; stock: number | null; active: number }
interface Line { productId: number; name: string; qty: string; unitCost: string }

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EntryEditor({ products, onCancel, onSaved }: {
  products: PickableProduct[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [postExpense, setPostExpense] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return products
      .filter((p) => p.active && `${p.name} ${p.sku ?? ''} ${p.category}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [products, q]);

  function addLine(p: PickableProduct) {
    setQ('');
    setLines((prev) => prev.some((l) => l.productId === p.id)
      ? prev
      : [...prev, { productId: p.id, name: p.name, qty: '1', unitCost: p.cost != null ? String(p.cost) : '' }]);
  }
  const patch = (i: number, next: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...next } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const lineTotal = (l: Line) => (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
  const total = Math.round(lines.reduce((a, l) => a + lineTotal(l), 0) * 100) / 100;
  // Stock is an integer column, so a fractional qty would round the cache and
  // desync it from the history. The API rejects it too; catching it here is kinder.
  const badQty = lines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) <= 0);
  const canSave = lines.length > 0 && !badQty && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await api('/api/stock/entries', {
        method: 'POST',
        body: JSON.stringify({
          supplier: supplier.trim(),
          note: note.trim(),
          postExpense,
          items: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), unitCost: Number(l.unitCost) || 0 })),
        }),
      });
      toast('Recepción registrada', 'success');
      onSaved();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo registrar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-5">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg"><PackagePlus size={16} /> Nueva recepción</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej. Distribuidora San Juan" /></Field>
        <Field label="Nota (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. factura 0012" /></Field>
      </div>

      {/* Product search */}
      <div className="relative mt-4">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto para agregar…" className="pl-10" />
        {matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
            {matches.map((p) => (
              <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-surface-2">
                <span className="truncate text-fg">{p.name}</span>
                <span className="tabular ml-3 shrink-0 text-xs text-muted">{p.stock ?? 0} en stock</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="mt-4">
        {lines.length === 0 ? (
          <EmptyState icon={<PackagePlus size={22} />} title="Sin productos" desc="Busca arriba lo que llegó y agrégalo." />
        ) : (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.productId} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-2.5">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{l.name}</p>
                <div className="w-20">
                  <label className="mb-1 block text-[11px] text-muted">Cantidad</label>
                  <Input value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} type="number" step="1" min="1" className="py-2" />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-[11px] text-muted">Costo unit.</label>
                  <Input value={l.unitCost} onChange={(e) => patch(i, { unitCost: e.target.value })} type="number" step="0.1" min="0" placeholder="0.00" className="py-2" />
                </div>
                <span className="tabular w-24 pb-2.5 text-right text-sm font-semibold text-fg">{money(lineTotal(l))}</span>
                <button onClick={() => removeLine(i)} className="mb-1.5 grid h-8 w-8 place-items-center rounded-lg text-subtle hover:text-danger"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {badQty && <p className="mt-2 text-xs text-danger">Las cantidades deben ser números enteros mayores que cero.</p>}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted">Total de la recepción</span>
        <span className="tabular text-lg font-semibold text-fg">{money(total)}</span>
      </div>

      <div className="mt-4 rounded-xl border border-border p-3">
        <Switch checked={postExpense} onChange={setPostExpense} label={`Registrar ${money(total)} como gasto en Caja`} />
        <p className="mt-1.5 text-xs text-muted">
          Actívalo si pagaste la mercadería hoy en efectivo. Sale de la caja del día, pero no se resta dos veces
          de tu ganancia: el costo ya se descuenta cuando vendes el producto.
        </p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={save} disabled={!canSave}><Plus size={15} /> {saving ? 'Guardando…' : 'Registrar recepción'}</Button>
      </div>
    </Card>
  );
}
