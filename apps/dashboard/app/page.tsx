'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Wallet, Clock, ShieldCheck, MessageCircle, ArrowUpRight, Plus, QrCode } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, getToken } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { StatCard, PageBody, Card, SectionCard, Badge, Avatar, EmptyState, Button } from '@/components/ui/primitives';
import { Sparkline, MiniBars } from '@/components/ui/Sparkline';
import GettingStarted from '@/components/onboarding/GettingStarted';
import LoginForm from '@/components/auth/LoginForm';

interface Charge { id: number; amount: number; currency: string; concept: string; status: string; paid_at: number | null; created_at: number; contact_name: string; contact_phone: string }
interface Conversation { id: number; name: string; unread_count: number; last_message: string | null; last_message_at: number }

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, { label: string; tone: any }> = {
  paid: { label: 'Pagado', tone: 'success' }, review: { label: 'En revisión', tone: 'warn' },
  pending: { label: 'Pendiente', tone: 'neutral' }, rejected: { label: 'Rechazado', tone: 'danger' },
  expired: { label: 'Vencido', tone: 'danger' }, cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export default function Home() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [waConnected, setWaConnected] = useState(false);
  const [signal, setSignal] = useState(0);
  // Auth gate: render the login form at / (root) when there's no token, so the PWA
  // is installable at the root path (see LoginForm). null = still checking (client).
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { setAuthed(Boolean(getToken())); }, []);

  const load = useCallback(() => {
    api<Charge[]>('/api/charges').then(setCharges).catch(() => {});
    api<Conversation[]>('/api/conversations').then(setConvos).catch(() => {});
    api<any[]>('/api/receipts?outcome=review').then((r) => setReviewCount(r.length)).catch(() => {});
    api<Record<string, string>>('/api/settings').then((s) => setBusinessName(s.business_name || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed) return; // don't fetch (and trigger a 401 redirect loop) when logged out
    load();
    return connectWs((e) => {
      if (e.type === 'wa.status') setWaConnected(e.status === 'connected');
      if (['charge.updated', 'receipt.review_needed', 'conversation.updated', 'payment.notification'].includes(e.type)) {
        load();
        setSignal((s) => s + 1); // nudge the checklist to re-check its steps
      }
    });
  }, [load, authed]);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() / 1000; };
    const todayStart = startOfDay(now);
    const weekStart = todayStart - 6 * 86400;
    const paid = charges.filter((c) => c.status === 'paid' && c.paid_at);
    const today = paid.filter((c) => c.paid_at! >= todayStart).reduce((s, c) => s + c.amount, 0);
    const week = paid.filter((c) => c.paid_at! >= weekStart).reduce((s, c) => s + c.amount, 0);
    const daily = Array.from({ length: 7 }, (_, i) => {
      const dayStart = todayStart - (6 - i) * 86400;
      return paid.filter((c) => c.paid_at! >= dayStart && c.paid_at! < dayStart + 86400).reduce((s, c) => s + c.amount, 0);
    });
    const pending = charges.filter((c) => c.status === 'pending').length;
    const unread = convos.reduce((s, c) => s + (c.unread_count || 0), 0);
    return { today, week, daily, pending, unread };
  }, [charges, convos]);

  const recentCharges = useMemo(() => [...charges].sort((a, b) => b.created_at - a.created_at).slice(0, 6), [charges]);
  const topUnread = useMemo(() => convos.filter((c) => c.unread_count > 0).slice(0, 5), [convos]);
  const hasSales = stats.daily.some((v) => v > 0);

  if (authed === null) return null; // brief: resolving auth on the client
  if (!authed) return <LoginForm />; // logged out → login lives at / (root) for the PWA

  return (
    <Shell>
      <PageBody className="max-w-6xl space-y-6 p-6 lg:p-8">
        <div className="fade-up">
          <p className="text-sm text-muted">Buen día{businessName ? ',' : ''} <span className="font-medium text-fg">{businessName || 'bienvenido'}</span> 👋</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-gradient">Resumen del negocio</h1>
        </div>

        <GettingStarted waConnected={waConnected} signal={signal} />

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Ingresos hoy" value={money(stats.today)} sub={`Esta semana ${money(stats.week)}`}
            icon={<Wallet size={18} />} chart={hasSales ? <Sparkline data={stats.daily} className="h-full w-full" /> : undefined} />
          <StatCard label="Cobros pendientes" value={stats.pending} sub={stats.pending ? 'esperando pago' : 'todo al día'}
            accent={stats.pending ? 'warn' : 'brand'} icon={<Clock size={18} />} />
          <StatCard label="Por revisar" value={reviewCount} sub={reviewCount ? 'comprobantes en cola' : 'sin pendientes'}
            accent={reviewCount ? 'danger' : 'brand'} icon={<ShieldCheck size={18} />} />
          <StatCard label="Sin leer" value={stats.unread} sub={`${convos.length} conversaciones`}
            accent="accent" icon={<MessageCircle size={18} />} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sales chart */}
          <SectionCard title="Ingresos · últimos 7 días" desc="Pagos confirmados por día" className="lg:col-span-2">
            {hasSales ? (
              <>
                <MiniBars data={stats.daily} className="h-40 w-full" />
                <div className="mt-2 flex justify-between text-[10px] text-subtle">
                  {stats.daily.map((_, i) => {
                    const d = new Date((Date.now() / 1000 - (6 - i) * 86400) * 1000);
                    return <span key={i} className="flex-1 text-center">{DAYS[d.getDay()]}</span>;
                  })}
                </div>
              </>
            ) : (
              <EmptyState icon={<Wallet size={26} />} title="Aún no hay ingresos" desc="Cuando confirmes un cobro aparecerá aquí." />
            )}
          </SectionCard>

          {/* Quick actions */}
          <Card className="flex flex-col gap-2.5 p-5">
            <h3 className="mb-1 text-base font-semibold text-fg">Acciones rápidas</h3>
            <Link href="/payments"><Button className="w-full justify-start"><Plus size={15} /> Crear un cobro</Button></Link>
            <Link href="/inbox"><Button variant="secondary" className="w-full justify-start"><MessageCircle size={15} /> Ir al Inbox</Button></Link>
            <Link href="/broadcasts"><Button variant="secondary" className="w-full justify-start"><ArrowUpRight size={15} /> Nueva campaña</Button></Link>
            <Link href="/connect"><Button variant="ghost" className="w-full justify-start"><QrCode size={15} /> Conexión WhatsApp</Button></Link>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent charges */}
          <SectionCard title="Cobros recientes" className="lg:col-span-2"
            actions={<Link href="/payments" className="text-xs font-medium text-brand hover:underline">Ver todos</Link>}>
            {recentCharges.length === 0 ? (
              <EmptyState icon={<Wallet size={24} />} title="Sin cobros todavía" />
            ) : (
              <div className="-mx-1 divide-y divide-border">
                {recentCharges.map((c) => {
                  const s = STATUS[c.status] ?? { label: c.status, tone: 'neutral' };
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-1 py-2.5">
                      <Avatar name={c.contact_name || c.contact_phone} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fg">{c.contact_name || c.contact_phone}</div>
                        {c.concept && <div className="truncate text-xs text-subtle">{c.concept}</div>}
                      </div>
                      <div className="text-right">
                        <div className="tabular text-sm font-semibold text-fg">{money(c.amount)}</div>
                        <Badge tone={s.tone} className="mt-0.5">{s.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Unread conversations */}
          <SectionCard title="Sin leer"
            actions={<Link href="/inbox" className="text-xs font-medium text-brand hover:underline">Inbox</Link>}>
            {topUnread.length === 0 ? (
              <EmptyState icon={<MessageCircle size={22} />} title="Todo leído" />
            ) : (
              <div className="space-y-1">
                {topUnread.map((c) => (
                  <Link key={c.id} href="/inbox" className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{c.name}</div>
                      <div className="truncate text-xs text-subtle">{c.last_message ?? ''}</div>
                    </div>
                    <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{c.unread_count}</span>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </PageBody>
    </Shell>
  );
}
