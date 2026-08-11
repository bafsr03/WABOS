'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coins, ArrowDownCircle, ArrowUpCircle, Plus } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Input, Button, Field, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import CashSessionCard, { type CashSession } from '@/components/cash/CashSessionCard';

interface Movement { id: number; kind: 'expense' | 'income' | 'adjustment'; amount: number; category: string; note: string; method: string; sold_at: number }
interface Position { opening: number; hasSession: boolean; status: 'none' | 'open' | 'closed'; cashSales: number; income: number; expenses: number; net: number }
interface DaySummary { count: number; gross: number; net: number; fees: number; byMethod: { method: string; total: number; count: number }[] }
interface PayMethod { id: string; label: string }
interface SessionInfo { day: string; session: CashSession | null; suggestedOpening: number }

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CashflowPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [day, setDay] = useState<string>('');
  // "Today" in the *business* timezone — only the server knows it, so ask once
  // rather than trusting the device clock.
  const [today, setToday] = useState<string>('');
  const [autoOpen, setAutoOpen] = useState(false);
  const toast = useToast();

  // ?day= lets the shopkeeper fix a day he forgot to close; ?caja=abrir is how the
  // POS banner sends him straight into the apertura.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDay(params.get('day') ?? '');
    setAutoOpen(params.get('caja') === 'abrir');
  }, []);

  const qs = day ? `?day=${day}` : '';
  const load = useCallback(() => {
    api<Movement[]>(`/api/cash-movements${qs}`).then(setMovements).catch(() => {});
    api<Position>(`/api/cash/position${qs}`).then(setPosition).catch(() => {});
    api<DaySummary>(`/api/sales/day-summary${qs}`).then(setSummary).catch(() => {});
    api<SessionInfo>(`/api/cash/session${qs}`).then(setSessionInfo).catch(() => {});
  }, [qs]);
  useEffect(() => {
    load();
    api<PayMethod[]>('/api/sales/payment-methods').then(setMethods).catch(() => {});
    api<SessionInfo>('/api/cash/session').then((s) => setToday(s.day)).catch(() => {});
  }, [load]);

  const methodLabel = (id: string) => methods.find((m) => m.id === id)?.label ?? id;
  const isToday = !day || day === today;

  return (
    <Shell>
      <div className="mx-auto max-w-3xl p-6 lg:p-8">
        <PageHeader
          title="Caja"
          subtitle="Inicio del día, movimientos y cierre con conteo."
          actions={
            <Input
              type="date"
              value={day || sessionInfo?.day || ''}
              onChange={(e) => setDay(e.target.value)}
              className="w-auto py-2"
              aria-label="Día"
            />
          }
        />

        {sessionInfo && (
          <CashSessionCard
            day={sessionInfo.day}
            session={sessionInfo.session}
            suggestedOpening={sessionInfo.suggestedOpening}
            expected={position?.net ?? 0}
            autoOpen={autoOpen}
            onChanged={load}
          />
        )}

        {/* Caja — el día */}
        <Card className="mb-6 p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg">
            <Coins size={16} /> Caja — {isToday ? 'Hoy' : sessionInfo?.day}
          </p>
          <div className="space-y-2 text-sm">
            {position?.hasSession && <Row label="Inicio de caja" value={money(position.opening)} />}
            <Row label={`Ventas${summary ? ` (${summary.count})` : ''}`} value={money(summary?.gross ?? 0)} strong />
            {summary?.byMethod.map((m) => (
              <Row key={m.method} label={methodLabel(m.method)} value={money(m.total)} indent muted />
            ))}
            {position && position.income > 0 && <Row label="Ingresos extra" value={money(position.income)} tone="income" />}
            {position && position.expenses > 0 && <Row label="Gastos" value={`−${money(position.expenses)}`} tone="expense" />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-base font-semibold text-fg">
              <span>Efectivo en caja{position?.status === 'closed' ? ' (esperado)' : ''}</span>
              <span className="tabular">{money(position?.net ?? 0)}</span>
            </div>
            {summary && summary.fees > 0 && <p className="pt-1 text-xs text-muted">Comisiones de tarjeta pagadas hoy: {money(summary.fees)}</p>}
            {/* Only cash sales land in the drawer — Yape/tarjeta go elsewhere, and
                saying so stops the two numbers from looking like a bug. */}
            {position && summary && summary.gross > position.cashSales && (
              <p className="pt-1 text-xs text-muted">Solo el efectivo entra a la caja: {money(position.cashSales)} de {money(summary.gross)} en ventas.</p>
            )}
          </div>
        </Card>

        {/* A new movement is always stamped "now", so offering the form while
            looking at a past day would file it somewhere the list can't show it. */}
        {isToday
          ? <QuickEntry methods={methods} onAdded={() => { load(); toast('Movimiento registrado', 'success'); }} />
          : <p className="text-sm text-muted">Estás viendo un día pasado. Vuelve a hoy para registrar gastos o ingresos.</p>}

        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg">Movimientos de{isToday ? ' hoy' : `l ${sessionInfo?.day}`}</h2>
          {movements.length === 0 ? (
            <EmptyState icon={<Coins size={24} />} title="Sin movimientos" desc="Registra un gasto o ingreso extra arriba." />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {movements.map((m) => {
                const income = m.kind === 'income';
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    {income ? <ArrowUpCircle size={18} className="shrink-0 text-success" /> : <ArrowDownCircle size={18} className="shrink-0 text-danger" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{m.note || m.category || (income ? 'Ingreso' : 'Gasto')}</p>
                      {m.category && <p className="text-xs text-muted">{m.category}</p>}
                    </div>
                    <span className={cn('tabular text-sm font-semibold', income ? 'text-success' : 'text-danger')}>{income ? '+' : '−'}{money(m.amount)}</span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, value, strong, muted, indent, tone }: { label: string; value: string; strong?: boolean; muted?: boolean; indent?: boolean; tone?: 'income' | 'expense' }) {
  return (
    <div className={cn('flex items-center justify-between', indent && 'pl-4')}>
      <span className={cn(muted ? 'text-muted' : 'text-fg', tone === 'income' && 'text-success', tone === 'expense' && 'text-danger', strong && 'font-medium')}>{label}</span>
      <span className={cn('tabular', muted ? 'text-muted' : 'text-fg', tone === 'income' && 'text-success', tone === 'expense' && 'text-danger', strong && 'font-medium')}>{value}</span>
    </div>
  );
}

function QuickEntry({ methods, onAdded }: { methods: PayMethod[]; onAdded: () => void }) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const CATS = kind === 'expense' ? ['Insumos', 'Transporte', 'Servicios', 'Comida', 'Otro'] : ['Adelanto', 'Devolución', 'Otro'];

  async function add() {
    if (!(Number(amount) > 0) || saving) return;
    setSaving(true);
    try {
      await api('/api/cash-movements', { method: 'POST', body: JSON.stringify({ kind, amount: Number(amount), category, note, method: 'cash' }) });
      setAmount(''); setCategory(''); setNote('');
      onAdded();
    } catch (err: any) {
      toast(err.message ?? 'No se pudo registrar', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {[{ v: 'expense', l: 'Gasto' }, { v: 'income', l: 'Ingreso extra' }].map((o) => (
          <button key={o.v} onClick={() => { setKind(o.v as any); setCategory(''); }}
            className={cn('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', kind === o.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}>
            {o.l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">S/</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.1" min="0" placeholder="0.00" className="pl-9" />
          </div>
        </Field>
        <Field label="Categoría">
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={cn('rounded-lg border px-2.5 py-1 text-xs transition', category === c ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted hover:text-fg')}>{c}</button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1"><Field label="Nota (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Agua, pasaje…" /></Field></div>
        <Button onClick={add} disabled={!(Number(amount) > 0) || saving}><Plus size={15} /> {saving ? 'Guardando…' : 'Agregar'}</Button>
      </div>
    </Card>
  );
}
