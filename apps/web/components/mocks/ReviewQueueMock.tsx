import { AlertTriangle, Check, X } from 'lucide-react';

/**
 * The human review queue. This is the honest half of the payment story: when
 * the checks don't line up, WABOS never rejects on its own — it asks you.
 * The reasons shown here mirror the real ones from modules/verification.ts.
 */
const CASES = [
  { who: 'Carlos R.', amount: 'S/ 19.00', reason: 'El monto no coincide con el cobro (S/ 21.00)' },
  { who: 'Ana Torres', amount: 'S/ 45.00', reason: 'Número de operación ya usado en otro comprobante' },
  { who: 'Lucía P.', amount: 'S/ 30.00', reason: 'Aún sin confirmación del banco' },
];

export function ReviewQueueMock({ className }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
        <AlertTriangle size={13} className="text-warn" />
        <span className="text-xs font-medium text-muted">Por revisar</span>
        <span className="ml-auto rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">3</span>
      </div>
      <div className="divide-y divide-border">
        {CASES.map((c) => (
          <div key={c.who} className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-fg">{c.who}</span>
              <span className="tabular ml-auto text-sm font-semibold text-fg">{c.amount}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{c.reason}</p>
            <div className="mt-2.5 flex gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success">
                <Check size={11} /> Aprobar
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-muted">
                <X size={11} /> Rechazar
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
