'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button, Input, Field } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// The single hand-edit path for stock. Two honest modes, because they mean
// different things in the history: a recount says "there are actually N", a
// correction says "N more/fewer than I thought".

export interface AdjustTarget { id: number; name: string; stock: number | null }

export default function StockAdjustSheet({ product, onClose, onSaved }: {
  product: AdjustTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'count' | 'delta'>('count');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const current = product?.stock ?? 0;
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && (mode === 'count' ? n >= 0 : n !== 0);
  const result = mode === 'count' ? n : current + n;

  async function save() {
    if (!product || !valid || saving) return;
    setSaving(true);
    try {
      await api(`/api/products/${product.id}/stock`, {
        method: 'POST',
        body: JSON.stringify(mode === 'count' ? { set: n, note } : { delta: n, note }),
      });
      toast('Stock actualizado', 'success');
      setValue(''); setNote('');
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo actualizar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={product !== null} onClose={onClose} title={product ? `Ajustar stock · ${product.name}` : 'Ajustar stock'}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Stock actual: <span className="tabular font-medium text-fg">{current}</span></p>

        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {[{ v: 'count', l: 'Conté y hay…' }, { v: 'delta', l: 'Sumar / restar' }].map((o) => (
            <button
              key={o.v}
              onClick={() => { setMode(o.v as 'count' | 'delta'); setValue(''); }}
              className={cn('rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
                mode === o.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}
            >
              {o.l}
            </button>
          ))}
        </div>

        <Field
          label={mode === 'count' ? 'Cantidad real en tienda' : 'Cantidad a sumar (o negativa para restar)'}
          hint={valid ? `Queda en ${Math.max(0, result)}` : 'Solo números enteros'}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            step="1"
            min={mode === 'count' ? '0' : undefined}
            placeholder={mode === 'count' ? String(current) : '0'}
            autoFocus
          />
        </Field>

        <Field label="Motivo (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. merma, rotura, conteo mensual" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!valid || saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  );
}
