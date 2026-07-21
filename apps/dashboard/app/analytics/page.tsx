'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, MessageCircle, Bot, Clock, TrendingUp, Search, PhoneOutgoing, BarChart3 } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { PageHeader, Card, SectionCard, StatCard, Select, EmptyState } from '@/components/ui/primitives';
import { Sparkline } from '@/components/ui/Sparkline';

interface Analytics {
  rangeDays: number;
  revenue: number;
  chargesCreated: number;
  chargesPaid: number;
  conversionPct: number | null;
  messagesIn: number;
  aiReplies: number;
  handoffs: number;
  medianResponseSeconds: number | null;
  revenueByDay: { day: string; amount: number }[];
  messagesByDay: { day: string; incoming: number; outgoing: number }[];
  topSearches: { query: string; count: number }[];
}

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
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<Analytics>(`/api/analytics?range=${range}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [range]);
  useEffect(load, [load]);

  const hasData = data && (data.revenue > 0 || data.messagesIn > 0 || data.chargesCreated > 0);
  const maxMsgs = data ? Math.max(1, ...data.messagesByDay.map((d) => d.incoming + d.outgoing)) : 1;
  const maxSearch = data ? Math.max(1, ...data.topSearches.map((s) => s.count)) : 1;

  return (
    <Shell>
      <div className="mx-auto max-w-5xl p-6 lg:p-8">
        <PageHeader
          title="Analítica"
          subtitle="Ventas, conversión, tiempos de respuesta y actividad de tu Empleado IA."
          actions={
            <Select value={String(range)} onChange={(e) => setRange(Number(e.target.value))} className="w-auto py-2 text-sm">
              {RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </Select>
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
            {/* KPI tiles */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Ingresos" value={money(data.revenue)} icon={<Wallet size={18} />}
                sub={`${data.chargesPaid} cobro${data.chargesPaid === 1 ? '' : 's'} pagado${data.chargesPaid === 1 ? '' : 's'}`}
                chart={<Sparkline data={data.revenueByDay.map((d) => d.amount)} />} />
              <StatCard label="Conversión" value={data.conversionPct === null ? '—' : `${data.conversionPct}%`} icon={<TrendingUp size={18} />}
                accent="accent" sub={`${data.chargesPaid}/${data.chargesCreated} cobros`} />
              <StatCard label="Respuesta IA" value={formatDuration(data.medianResponseSeconds)} icon={<Clock size={18} />}
                sub="mediana" />
              <StatCard label="Mensajes recibidos" value={data.messagesIn.toLocaleString('es-PE')} icon={<MessageCircle size={18} />}
                sub={`${data.aiReplies.toLocaleString('es-PE')} respuestas IA`} />
            </div>

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

            {/* Secondary row */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SectionCard title="Búsquedas más frecuentes" desc="Lo que tus clientes preguntan"
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

              <SectionCard title="Empleado IA" desc="Cómo trabaja tu asistente">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-surface-2 p-4">
                    <div className="flex items-center gap-1.5 text-xs text-subtle"><Bot size={13} /> Respuestas IA</div>
                    <div className="tabular mt-1 text-2xl font-semibold text-fg">{data.aiReplies.toLocaleString('es-PE')}</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-4">
                    <div className="flex items-center gap-1.5 text-xs text-subtle"><PhoneOutgoing size={13} /> Derivaciones</div>
                    <div className="tabular mt-1 text-2xl font-semibold text-fg">{data.handoffs.toLocaleString('es-PE')}</div>
                  </div>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
