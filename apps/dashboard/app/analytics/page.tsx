'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Bot, Clock, TrendingUp, Search, PhoneOutgoing, BarChart3, Receipt, Boxes, Info } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, SectionCard, StatCard, Select, EmptyState } from '@/components/ui/primitives';
import { Sparkline } from '@/components/ui/Sparkline';

// Money and the Empleado IA are two different questions, so they get two
// sections instead of sharing a KPI row. Inventory lives in /inventory.
function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-center gap-3', className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface Analytics {
  rangeDays: number;
  revenue: number;
  netSales: number;
  fees: number;
  cogs: number;
  expenses: number;
  purchases: number;
  netProfit: number;
  channel: 'all' | 'pos' | 'whatsapp' | 'ai';
  chargesCreated: number;
  chargesPaid: number;
  conversionPct: number | null;
  messagesIn: number;
  aiReplies: number;
  handoffs: number;
  medianResponseSeconds: number | null;
  revenueByDay: { day: string; amount: number }[];
  messagesByDay: { day: string; incoming: number; outgoing: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  salesByMethod: { method: string; total: number; net: number; fees: number; count: number }[];
  salesByChannel: { channel: string; total: number; net: number; count: number }[];
  linelessSales: number;
  topSearches: { query: string; count: number }[];
}

const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin', card: 'Tarjeta' };
const CHANNEL_LABELS: Record<string, string> = { pos: 'Tienda (POS)', whatsapp: 'WhatsApp', ai: 'Empleado IA' };
const CHANNEL_FILTERS = [
  { v: '', l: 'Todo' },
  { v: 'pos', l: 'Tienda' },
  { v: 'whatsapp', l: 'WhatsApp' },
] as const;

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDuration(secs: number | null): string {
  if (secs === null) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  return `${m}m ${secs % 60}s`;
}

const RANGES = [{ v: 7, l: '7 días' }, { v: 30, l: '30 días' }, { v: 90, l: '90 días' }];

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const [channel, setChannel] = useState<'' | 'pos' | 'whatsapp'>('');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<Analytics>(`/api/analytics?range=${range}${channel ? `&channel=${channel}` : ''}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [range, channel]);
  useEffect(load, [load]);

  const hasData = data && (data.revenue > 0 || data.messagesIn > 0 || data.chargesCreated > 0);
  const maxMsgs = data ? Math.max(1, ...data.messagesByDay.map((d) => d.incoming + d.outgoing)) : 1;
  const maxSearch = data ? Math.max(1, ...data.topSearches.map((s) => s.count)) : 1;
  const maxMethodTotal = data ? Math.max(1, ...data.salesByMethod.map((m) => m.total)) : 1;
  const maxChannelTotal = data ? Math.max(1, ...data.salesByChannel.map((c) => c.total)) : 1;
  const saleCount = data ? data.salesByMethod.reduce((a, m) => a + m.count, 0) : 0;
  const avgTicket = saleCount > 0 && data ? data.revenue / saleCount : 0;

  return (
    <Shell>
      <div className="mx-auto max-w-5xl p-6 lg:p-8">
        <PageHeader
          title="Analítica"
          subtitle="Tu dinero primero; la actividad del Empleado IA, aparte."
          actions={
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-1">
                {CHANNEL_FILTERS.map((c) => (
                  <button
                    key={c.v}
                    onClick={() => setChannel(c.v as '' | 'pos' | 'whatsapp')}
                    className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition',
                      channel === c.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}
                  >
                    {c.l}
                  </button>
                ))}
              </div>
              <Select value={String(range)} onChange={(e) => setRange(Number(e.target.value))} className="w-auto py-2 text-sm">
                {RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </Select>
            </div>
          }
        />

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
          </div>
        ) : !hasData ? (
          <EmptyState icon={<BarChart3 size={24} />} title="Aún no hay datos"
            desc="En cuanto empieces a recibir mensajes y cobros, verás aquí tus métricas." />
        ) : data && (
          <>
            <SectionHeading>Dinero</SectionHeading>

            {/* KPI tiles — money only. AI latency belongs with the AI, below. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Ventas" value={money(data.revenue)} icon={<Wallet size={18} />}
                sub={`neto ${money(data.netSales)}`}
                chart={<Sparkline data={data.revenueByDay.map((d) => d.amount)} />} />
              <StatCard label="Ganancia neta" value={money(data.netProfit)} icon={<TrendingUp size={18} />}
                accent="accent" sub={`gastos ${money(data.expenses - data.purchases)} · costo ${money(data.cogs)}`} />
              <StatCard label="Comisiones" value={money(data.fees)} icon={<Wallet size={18} />}
                sub="tarjeta y otros" />
              <StatCard label="Ticket promedio" value={money(avgTicket)} icon={<Receipt size={18} />}
                sub={`${saleCount} venta${saleCount === 1 ? '' : 's'}`} />
            </div>

            {data.purchases > 0 && (
              <p className="mt-3 text-xs text-muted">
                No se resta de la ganancia {money(data.purchases)} en compras de mercadería: ese costo ya se descuenta cuando vendes cada producto.
              </p>
            )}

            {/* Revenue over time */}
            <SectionCard className="mt-6" title="Ingresos por día" desc={`Últimos ${data.rangeDays} días`}>
              {data.revenueByDay.length < 2 ? (
                <p className="py-8 text-center text-sm text-muted">Aún no hay suficientes pagos para graficar.</p>
              ) : (
                <div className="h-40">
                  <Sparkline data={data.revenueByDay.map((d) => d.amount)} className="h-full w-full" />
                </div>
              )}
            </SectionCard>

            {/* Where the money came from. Unfiltered on purpose — this card is the split. */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SectionCard title="Ventas por origen" desc="Mostrador vs WhatsApp">
                {data.salesByChannel.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Aún no hay ventas registradas.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.salesByChannel.map((c) => (
                      <div key={c.channel} className="flex items-center gap-3 text-sm">
                        <span className="w-28 shrink-0 truncate text-fg">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(c.total / maxChannelTotal) * 100}%` }} />
                        </div>
                        <span className="tabular w-8 shrink-0 text-right text-xs text-muted">{c.count}</span>
                        <span className="tabular w-20 shrink-0 text-right text-xs text-fg">{money(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Métodos de pago" desc="Cómo te pagan tus clientes">
                {data.salesByMethod.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Aún no hay ventas registradas.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.salesByMethod.map((m) => (
                      <div key={m.method} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 truncate text-fg">{METHOD_LABELS[m.method] ?? m.method}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(m.total / maxMethodTotal) * 100}%` }} />
                        </div>
                        <span className="tabular w-20 shrink-0 text-right text-xs text-fg">{money(m.total)}</span>
                        {m.fees > 0 && <span className="tabular w-16 shrink-0 text-right text-[11px] text-danger" title="Comisiones">−{money(m.fees)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Sales the AI closed with no products attached: stated, never guessed. */}
            {data.linelessSales > 0 && (
              <Card className="mt-6 flex items-start gap-3 p-4">
                <Info size={18} className="mt-0.5 shrink-0 text-info" />
                <p className="text-sm text-muted">
                  <span className="font-medium text-fg">{data.linelessSales} venta{data.linelessSales === 1 ? '' : 's'} por WhatsApp sin productos asignados.</span>{' '}
                  Cuentan como ingreso pero no descontaron stock ni suman costo, así que la ganancia de esas ventas se ve más alta de lo real.
                </p>
              </Card>
            )}

            <Link href="/inventory" className="mt-6 flex items-center gap-2 text-sm text-brand hover:underline">
              <Boxes size={15} /> Ver productos más vendidos, stock y entradas en Inventario
            </Link>

            <SectionHeading className="mt-10">Empleado IA</SectionHeading>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Respuesta IA" value={formatDuration(data.medianResponseSeconds)} icon={<Clock size={18} />} sub="mediana" />
              <StatCard label="Respuestas IA" value={data.aiReplies.toLocaleString('es-PE')} icon={<Bot size={18} />} sub={`${data.messagesIn.toLocaleString('es-PE')} mensajes recibidos`} />
              <StatCard label="Derivaciones" value={data.handoffs.toLocaleString('es-PE')} icon={<PhoneOutgoing size={18} />} sub="pasaron a un humano" />
              <StatCard label="Conversión de cobros" value={data.conversionPct !== null ? `${data.conversionPct}%` : '—'} icon={<TrendingUp size={18} />} sub={`${data.chargesPaid}/${data.chargesCreated} pagados`} />
            </div>

            {/* Messages per day: incoming vs outgoing stacked mini-bars */}
            <SectionCard className="mt-6" title="Actividad de mensajes" desc="Recibidos vs enviados por día"
              actions={
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" /> Recibidos</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-border-strong" /> Enviados</span>
                </div>
              }>
              {data.messagesByDay.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Sin actividad en este periodo.</p>
              ) : (
                <div className="flex h-40 items-end gap-1">
                  {data.messagesByDay.map((d) => (
                    <div key={d.day} className="group relative flex flex-1 flex-col justify-end gap-0.5" title={`${d.day}: ${d.incoming} recibidos, ${d.outgoing} enviados`}>
                      <div className="w-full rounded-t-sm bg-brand/80" style={{ height: `${(d.incoming / maxMsgs) * 100}%` }} />
                      <div className="w-full rounded-b-sm bg-border-strong" style={{ height: `${(d.outgoing / maxMsgs) * 100}%` }} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Demand signal — what customers ask the AI for. */}
            <div className="mt-6">
              <SectionCard title="Búsquedas más frecuentes" desc="Lo que tus clientes le preguntan al Empleado IA"
                actions={<Search size={15} className="text-subtle" />}>
                {data.topSearches.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Aún no hay búsquedas registradas.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.topSearches.map((s) => (
                      <div key={s.query} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate text-fg" title={s.query}>{s.query}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(s.count / maxSearch) * 100}%` }} />
                        </div>
                        <span className="tabular w-6 shrink-0 text-right text-xs text-muted">{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
