import { TrendingUp } from 'lucide-react';

const BARS = [42, 58, 35, 71, 64, 88, 76];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Analytics summary card. The KPI labels mirror what apps/dashboard actually
 * computes — gross revenue, net profit after COGS/fees/expenses, and the
 * review queue depth.
 */
export function DashboardMock({ className }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] ${className ?? ''}`}>
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-2 text-xs font-medium text-muted">WABOS · Resumen</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-wa/10 px-2 py-0.5 text-[10px] font-medium text-wa">
          <span className="h-1.5 w-1.5 rounded-full bg-wa" /> Conectado
        </span>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Ingresos hoy', value: 'S/ 842' },
            { label: 'Ganancia neta', value: 'S/ 311' },
            { label: 'Por revisar', value: '3' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="text-[11px] text-subtle">{k.label}</div>
              <div className="tabular mt-1 text-lg font-semibold text-fg">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Ingresos · 7 días</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <TrendingUp size={12} /> S/ 4,190
            </span>
          </div>
          {/* h-full + justify-end on the column is load-bearing: the bars are
              sized in %, which collapses to 0 against an auto-height parent. */}
          <div className="mt-4 flex h-28 items-stretch gap-2">
            {BARS.map((h, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand-deep to-brand"
                  style={{ height: `${h}%` }}
                />
                <span className="text-[9px] leading-none text-subtle">{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
