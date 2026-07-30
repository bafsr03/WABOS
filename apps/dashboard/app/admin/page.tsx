'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Owner-only ops console. The backend (/api/admin/overview) enforces access by
// email allow-list — this page just renders it and shows a friendly wall on 403.
// It's intentionally NOT in the customer nav; reach it directly at /admin.

interface BizRow {
  id: number; name: string; plan_tier: string; created_at: number;
  wa_phone: string | null; owner_email: string | null;
  contacts: number; products: number; sales: number; revenue: number;
  ai_messages_month: number; ai_cost_month_usd: number; last_activity: number | null;
}
interface Overview {
  generatedAt: number;
  users: { total: number; new7d: number; new30d: number };
  businesses: { total: number; waConnected: number; byTier: Record<string, number> };
  activity: { messagesTotal: number; messages24h: number; messages7d: number; aiMessages30d: number };
  commerce: { contacts: number; products: number; sales: number; revenue: number; revenue30d: number };
  ai: {
    model: string; priceInputPerM: number; priceOutputPerM: number;
    messagesMonth: number; tokensInMonth: number; tokensOutMonth: number;
    tokensInAll: number; tokensOutAll: number;
    estCostMonthUsd: number; estCostAllUsd: number; businessesAtCap: number;
  };
  subscriptions: { paying: number; byStatus: Record<string, number> };
  list: BizRow[];
}

const pen = (n: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n || 0);
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: (n || 0) < 10 ? 4 : 2 }).format(n || 0);
const int = (n: number) => new Intl.NumberFormat('es-PE').format(n || 0);
// Compact token counts: 12.3k, 4.5M
const compact = (n: number) => new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const day = (s: number) => new Date(s * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
const ago = (s: number | null) => {
  if (!s) return '—';
  const d = Math.floor((Date.now() / 1000 - s) / 86400);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d}d`;
  return day(s);
};

const TIER_ORDER = ['free', 'basico', 'avanzado', 'pro', 'enterprise'];
const TIER_STYLE: Record<string, string> = {
  free: 'bg-surface-3 text-muted',
  basico: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  avanzado: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  pro: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  enterprise: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Tier({ t }: { t: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[t] ?? 'bg-surface-3 text-muted'}`}>{t}</span>;
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api<Overview>('/api/admin/overview')
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e?.message ?? 'Error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <Frame><p className="text-muted">Cargando…</p></Frame>;
  if (error) return (
    <Frame>
      <div className="rounded-2xl border border-border bg-surface-2 p-8 text-center">
        <div className="text-lg font-semibold text-fg">Acceso restringido</div>
        <p className="mt-2 text-sm text-muted">{error === 'Acceso restringido'
          ? 'Tu cuenta no está en la lista de administradores.'
          : error}</p>
      </div>
    </Frame>
  );
  if (!data) return null;

  return (
    <Frame>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Usuarios" value={int(data.users.total)} sub={`+${int(data.users.new7d)} en 7d · +${int(data.users.new30d)} en 30d`} />
        <Stat label="Negocios" value={int(data.businesses.total)} sub={`${int(data.businesses.waConnected)} con WhatsApp`} />
        <Stat label="Pagando" value={int(data.subscriptions.paying)} sub={`${int(data.businesses.byTier['enterprise'] ?? 0)} enterprise (gratis)`} />
        <Stat label="Ventas de clientes" value={pen(data.commerce.revenue)} sub={`${pen(data.commerce.revenue30d)} en 30d · ${int(data.commerce.sales)} ventas`} />
        <Stat label="Mensajes 24h" value={int(data.activity.messages24h)} sub={`${int(data.activity.messages7d)} en 7d`} />
        <Stat label="Mensajes (total)" value={int(data.activity.messagesTotal)} />
        <Stat label="Respuestas IA 30d" value={int(data.activity.aiMessages30d)} />
        <Stat label="Contactos / Productos" value={`${int(data.commerce.contacts)} / ${int(data.commerce.products)}`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-subtle">Planes:</span>
        {TIER_ORDER.filter((t) => data.businesses.byTier[t]).map((t) => (
          <span key={t} className="flex items-center gap-1.5"><Tier t={t} /><span className="text-sm text-muted">{int(data.businesses.byTier[t])}</span></span>
        ))}
      </div>

      {/* ── Gasto de IA (Claude) ── */}
      <div className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg">Gasto de IA (Claude)</h2>
          <span className="text-xs text-subtle">modelo: {data.ai.model}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Costo estimado (mes)" value={usd(data.ai.estCostMonthUsd)} sub={`${int(data.ai.messagesMonth)} respuestas IA`} />
          <Stat label="Costo estimado (total)" value={usd(data.ai.estCostAllUsd)} />
          <Stat label="Tokens este mes" value={`${compact(data.ai.tokensInMonth)} → ${compact(data.ai.tokensOutMonth)}`} sub="entrada → salida" />
          <Stat label="Negocios en tope IA" value={int(data.ai.businessesAtCap)} sub="alcanzaron su límite mensual" />
        </div>
        <p className="mt-2 text-xs text-subtle">
          Estimado: tokens × precio configurable (${data.ai.priceInputPerM}/M entrada · ${data.ai.priceOutputPerM}/M salida).
          Ajusta con <code className="rounded bg-surface-3 px-1">AI_PRICE_INPUT_PER_M</code> / <code className="rounded bg-surface-3 px-1">AI_PRICE_OUTPUT_PER_M</code> según la consola de Anthropic.
        </p>
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-fg">Negocios</h2>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-3 py-2.5">Negocio</th><th className="px-3 py-2.5">Dueño</th>
              <th className="px-3 py-2.5">Plan</th><th className="px-3 py-2.5">Alta</th>
              <th className="px-3 py-2.5">Actividad</th>
              <th className="px-3 py-2.5 text-right">Contactos</th><th className="px-3 py-2.5 text-right">Productos</th>
              <th className="px-3 py-2.5 text-right">Ventas</th><th className="px-3 py-2.5 text-right">Ingresos</th>
              <th className="px-3 py-2.5 text-right">IA (mes)</th><th className="px-3 py-2.5 text-right">Costo IA</th>
              <th className="px-3 py-2.5 text-center">WA</th>
            </tr>
          </thead>
          <tbody>
            {data.list.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-3 py-2.5 font-medium text-fg">{b.name || <span className="text-subtle">sin nombre</span>}</td>
                <td className="px-3 py-2.5 text-muted">{b.owner_email ?? '—'}</td>
                <td className="px-3 py-2.5"><Tier t={b.plan_tier} /></td>
                <td className="px-3 py-2.5 text-muted">{day(b.created_at)}</td>
                <td className="px-3 py-2.5 text-muted">{ago(b.last_activity)}</td>
                <td className="px-3 py-2.5 text-right text-muted">{int(b.contacts)}</td>
                <td className="px-3 py-2.5 text-right text-muted">{int(b.products)}</td>
                <td className="px-3 py-2.5 text-right text-muted">{int(b.sales)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-fg">{pen(b.revenue)}</td>
                <td className="px-3 py-2.5 text-right text-muted">{int(b.ai_messages_month)}</td>
                <td className="px-3 py-2.5 text-right text-muted">{usd(b.ai_cost_month_usd)}</td>
                <td className="px-3 py-2.5 text-center">{b.wa_phone ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-subtle">Actualizado {new Date(data.generatedAt * 1000).toLocaleString('es-PE')} · <button onClick={load} className="underline">refrescar</button></p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fg">WABOS · Panel de administración</h1>
          <p className="text-sm text-muted">Vista global de la plataforma (solo dueño)</p>
        </div>
        <a href="/" className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted hover:text-fg">← App</a>
      </header>
      {children}
    </div>
  );
}
