'use client';

import { useState } from 'react';
import { Lock, LockOpen, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge, Input, Field } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// The cash day. Before this the drawer silently assumed it started empty every
// morning, so yesterday's carry-over was invisible: "inicio de caja" is the
// number the shopkeeper actually starts the day counting.

export interface CashSession {
  id: number;
  day: string;
  status: 'open' | 'closed';
  opening_amount: number;
  opened_at: number;
  closing_counted: number | null;
  expected_closing: number | null;
  difference: number | null;
  closed_at: number | null;
  note: string;
}

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export default function CashSessionCard({ day, session, suggestedOpening, expected, onChanged, autoOpen }: {
  day: string;
  session: CashSession | null;
  suggestedOpening: number;
  expected: number;
  onChanged: () => void;
  autoOpen?: boolean;
}) {
  const [mode, setMode] = useState<'open' | 'close' | null>(autoOpen && !session ? 'open' : null);

  return (
    <>
      <Card className="mb-6 p-5">
        {!session ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><Lock size={16} /> Caja sin abrir</p>
              <p className="mt-1 text-sm text-muted">Indica con cuánto efectivo empiezas el día para que el conteo cuadre.</p>
            </div>
            <Button onClick={() => setMode('open')}>Abrir caja</Button>
          </div>
        ) : session.status === 'open' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><LockOpen size={16} /> Caja abierta</p>
              <p className="mt-1 text-sm text-muted">
                Inicio de caja <span className="tabular font-medium text-fg">{money(session.opening_amount)}</span> · abierta {time(session.opened_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setMode('open')}>Corregir inicio</Button>
              <Button onClick={() => setMode('close')}>Cerrar caja</Button>
            </div>
          </div>
        ) : (
          <ClosedSummary session={session} onReopen={async () => {
            await api('/api/cash/session/reopen', { method: 'POST', body: JSON.stringify({ day }) });
            onChanged();
          }} />
        )}
      </Card>

      <OpenCloseCashModal
        mode={mode}
        day={day}
        onClose={() => setMode(null)}
        suggestedOpening={session?.opening_amount ?? suggestedOpening}
        isCorrection={mode === 'open' && session?.status === 'open'}
        expected={expected}
        onDone={() => { setMode(null); onChanged(); }}
      />
    </>
  );
}

function ClosedSummary({ session, onReopen }: { session: CashSession; onReopen: () => void }) {
  const diff = session.difference ?? 0;
  const tone = diff === 0 ? 'success' : diff > 0 ? 'warn' : 'danger';
  const label = diff === 0 ? 'Cuadrado' : diff > 0 ? `Sobra ${money(diff)}` : `Falta ${money(-diff)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Scale size={16} /> Caja cerrada {session.closed_at ? `· ${time(session.closed_at)}` : ''}
        </p>
        <p className="mt-1 text-sm text-muted">
          Esperado <span className="tabular text-fg">{money(session.expected_closing ?? 0)}</span>
          {' · '}Contado <span className="tabular text-fg">{money(session.closing_counted ?? 0)}</span>
        </p>
        {session.note && <p className="mt-1 text-xs text-muted">{session.note}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={tone}>{label}</Badge>
        <button onClick={onReopen} className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline">Reabrir</button>
      </div>
    </div>
  );
}

function OpenCloseCashModal({ mode, day, suggestedOpening, isCorrection, expected, onClose, onDone }: {
  mode: 'open' | 'close' | null;
  day: string;
  suggestedOpening: number;
  isCorrection: boolean;
  expected: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Remount per open so the prefill is fresh and stale input never carries over.
  const key = `${mode}-${day}`;

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0 || saving) return;
    setSaving(true);
    try {
      if (mode === 'open') {
        await api('/api/cash/session/open', { method: 'POST', body: JSON.stringify({ day, amount: value }) });
        toast(isCorrection ? 'Inicio de caja actualizado' : 'Caja abierta', 'success');
      } else {
        await api('/api/cash/session/close', { method: 'POST', body: JSON.stringify({ day, counted: value, note }) });
        toast('Caja cerrada', 'success');
      }
      setAmount(''); setNote('');
      onDone();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  }

  const counted = Number(amount);
  const preview = mode === 'close' && amount !== '' && Number.isFinite(counted)
    ? Math.round((counted - expected) * 100) / 100
    : null;

  return (
    <Modal open={mode !== null} onClose={onClose} title={mode === 'close' ? 'Cerrar caja' : isCorrection ? 'Corregir inicio de caja' : 'Abrir caja'}>
      <div key={key} className="space-y-4">
        {mode === 'open' ? (
          <>
            <p className="text-sm text-muted">¿Con cuánto efectivo empiezas el día?</p>
            <Field label="Inicio en efectivo" hint={suggestedOpening > 0 ? `Cierre de ayer: ${money(suggestedOpening)}` : undefined}>
              <MoneyInput value={amount} onChange={setAmount} placeholder={suggestedOpening.toFixed(2)} />
            </Field>
            {amount === '' && suggestedOpening > 0 && (
              <button onClick={() => setAmount(String(suggestedOpening))} className="text-xs text-brand hover:underline">
                Usar {money(suggestedOpening)}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Cuenta el efectivo de la caja y anótalo. Esperado: <span className="tabular font-medium text-fg">{money(expected)}</span></p>
            <Field label="Efectivo contado">
              <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" />
            </Field>
            {preview !== null && (
              <p className={preview === 0 ? 'text-sm text-success' : preview > 0 ? 'text-sm text-warn' : 'text-sm text-danger'}>
                {preview === 0 ? 'Cuadra exacto ✅' : preview > 0 ? `Sobra ${money(preview)}` : `Falta ${money(-preview)}`}
              </p>
            )}
            <Field label="Nota (opcional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. faltó vuelto de la mañana" />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={amount === '' || saving}>
            {saving ? 'Guardando…' : mode === 'close' ? 'Cerrar caja' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">S/</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type="number" step="0.1" min="0" placeholder={placeholder} className="pl-9" autoFocus />
    </div>
  );
}
