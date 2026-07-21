'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Users, ShoppingBag, Wallet, Megaphone,
  Smartphone, Settings, LogOut, Plus, MoreHorizontal, X, Sparkles, Bot, BookOpen, BarChart3, type LucideIcon,
} from 'lucide-react';
import { api, clearToken, getToken, getStatus } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { cn } from '@/lib/cn';
import { StatusDot, Button } from '@/components/ui/primitives';
import BusinessSwitcher from '@/components/BusinessSwitcher';
import InstallPrompt from '@/components/InstallPrompt';
import { unsubscribeFromPush } from '@/lib/push';
import { unregisterNativePush } from '@/lib/native';

interface NavItem { href: string; label: string; icon: LucideIcon }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ href: '/', label: 'Resumen', icon: LayoutDashboard }] },
  { group: 'Operación', items: [
    { href: '/inbox', label: 'Inbox', icon: MessageCircle },
    { href: '/contacts', label: 'Contactos', icon: Users },
    { href: '/catalog', label: 'Catálogo', icon: ShoppingBag },
    { href: '/knowledge', label: 'Conocimiento', icon: BookOpen },
    { href: '/agents', label: 'Agentes IA', icon: Bot },
    { href: '/voice', label: 'ADN de voz', icon: Sparkles },
  ] },
  { group: 'Ingresos', items: [
    { href: '/payments', label: 'Cobros', icon: Wallet },
    { href: '/broadcasts', label: 'Campañas', icon: Megaphone },
    { href: '/analytics', label: 'Analítica', icon: BarChart3 },
  ] },
  { group: 'Sistema', items: [
    { href: '/connect', label: 'Conexión', icon: Smartphone },
    { href: '/settings', label: 'Ajustes', icon: Settings },
  ] },
];
const ALL = NAV.flatMap((g) => g.items);
// Mobile floating bar: 4 primary destinations in the nav pill, the rest live in the "Más" sheet.
const PRIMARY: NavItem[] = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: MessageCircle },
  { href: '/catalog', label: 'Catálogo', icon: ShoppingBag },
  { href: '/payments', label: 'Cobros', icon: Wallet },
];
const OVERFLOW: NavItem[] = [
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/analytics', label: 'Analítica', icon: BarChart3 },
  { href: '/knowledge', label: 'Conocimiento', icon: BookOpen },
  { href: '/agents', label: 'Agentes IA', icon: Bot },
  { href: '/voice', label: 'ADN de voz', icon: Sparkles },
  { href: '/broadcasts', label: 'Campañas', icon: Megaphone },
  { href: '/connect', label: 'Conexión', icon: Smartphone },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];
const WA_LABEL: Record<string, string> = { connected: 'Conectado', qr: 'Escanea QR', connecting: 'Conectando…', disconnected: 'Desconectado' };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [waStatus, setWaStatus] = useState('...');
  const [sheet, setSheet] = useState(false);
  const [overCap, setOverCap] = useState(false);

  const checkCap = () => getStatus()
    .then((s) => setOverCap(s.usage.aiMessagesLimit != null && s.usage.aiMessages >= s.usage.aiMessagesLimit))
    .catch(() => {});

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    setReady(true);
    checkCap();
    return connectWs((event) => {
      if (event.type === 'wa.status') setWaStatus(event.status);
      if (event.type === 'ai.quota_exceeded') setOverCap(true);
    });
  }, [router]);

  useEffect(() => { setSheet(false); }, [pathname]); // close on navigate

  // Signing out also pauses the WhatsApp socket, but keeps the link + all data;
  // logging back in resumes with the same number (see login → /api/session/open).
  async function signOut() {
    await unsubscribeFromPush().catch(() => {});
    await unregisterNativePush().catch(() => {});
    await api('/api/session/close', { method: 'POST' }).catch(() => {});
    clearToken();
    router.replace('/login');
  }

  const active = useMemo(() =>
    ALL.filter((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)))
      .sort((a, b) => b.href.length - a.href.length)[0], [pathname]);

  if (!ready) return null;

  const waTone = waStatus === 'connected' ? 'success' : waStatus === 'qr' || waStatus === 'connecting' ? 'warn' : 'danger';

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-surface/70">
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="flex items-center justify-between px-5 pb-2 pt-6">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">W</span>
          <span className="font-display text-xl font-semibold tracking-tight text-fg">WAB<span className="text-brand">OS</span></span>
        </Link>
        {onNavigate && <button onClick={onNavigate} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"><X size={18} /></button>}
      </div>
      <div className="space-y-2 px-5">
        <BusinessSwitcher />
        <Link href="/connect" onClick={onNavigate} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs transition hover:border-border-strong">
          <StatusDot tone={waTone} pulse={waStatus === 'connected'} />
          <span className="text-muted">WhatsApp</span>
          <span className="ml-auto font-medium text-fg">{WA_LABEL[waStatus] ?? waStatus}</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((section) => (
          <div key={section.group}>
            {section.group && <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">{section.group}</div>}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = active?.href === item.href;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}
                    className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                      isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />}
                    <Icon size={17} className={cn('transition', isActive ? 'text-brand' : 'text-subtle group-hover:text-fg')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <button onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-danger">
          <LogOut size={17} /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  const overflowActive = OVERFLOW.some((i) => active?.href === i.href);
  const barPill = 'pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface/85 p-1.5 shadow-[0_10px_34px_-10px_rgba(11,11,15,0.35)] backdrop-blur-xl';
  const tabCls = (on: boolean) =>
    cn('grid h-11 w-11 place-items-center rounded-full transition', on ? 'bg-brand/12 text-brand' : 'text-subtle hover:bg-surface-2 hover:text-fg');

  return (
    <div className="flex h-[100dvh] bg-bg text-fg">
      {/* Static sidebar (desktop) */}
      <aside className="relative hidden w-60 shrink-0 border-r border-border lg:block">{sidebar()}</aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
          <h2 className="font-display text-sm font-semibold text-fg">{active?.label ?? 'WABOS'}</h2>
          <div className="ml-auto flex items-center gap-2">
            {active?.href !== '/payments' && (
              <Link href="/payments" className="hidden lg:block"><Button size="sm" variant="secondary"><Plus size={14} /> Nuevo cobro</Button></Link>
            )}
          </div>
        </header>
        {overCap && (
          <Link href="/settings?billing=cap" className="flex items-center gap-2 border-b border-danger/20 bg-danger/10 px-4 py-2 text-xs font-medium text-danger transition hover:bg-danger/16 sm:px-6">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-danger/20">!</span>
            Alcanzaste el límite de mensajes de IA de tu plan — la IA dejó de responder. Actualiza para reactivarla.
          </Link>
        )}
        <main className="aurora min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-0">{children}</main>
      </div>

      <InstallPrompt />

      {/* Floating bottom bar (mobile) — Whop-style grouped pills */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2.5 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] lg:hidden">
        <nav className={barPill}>
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} className={tabCls(active?.href === item.href)}>
                <Icon size={21} />
              </Link>
            );
          })}
        </nav>
        <div className={barPill}>
          <button onClick={() => setSheet(true)} aria-label="Más opciones" title="Más" className={tabCls(overflowActive)}>
            <MoreHorizontal size={21} />
          </button>
          <Link href="/payments" aria-label="Nuevo cobro" title="Nuevo cobro"
            className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-[var(--shadow-card)] transition hover:bg-brand-strong">
            <Plus size={21} />
          </Link>
        </div>
      </div>

      {/* "Más" bottom sheet (mobile) */}
      <AnimatePresence>
        {sheet && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border-strong" />

              <div className="mb-3"><BusinessSwitcher /></div>

              <Link href="/connect" className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-sm transition hover:border-border-strong">
                <StatusDot tone={waTone} pulse={waStatus === 'connected'} />
                <span className="text-muted">WhatsApp</span>
                <span className="ml-auto font-medium text-fg">{WA_LABEL[waStatus] ?? waStatus}</span>
              </Link>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {OVERFLOW.map((item) => {
                  const Icon = item.icon;
                  const on = active?.href === item.href;
                  return (
                    <Link key={item.href} href={item.href}
                      className={cn('flex items-center gap-3 rounded-2xl border p-3.5 text-sm font-medium transition',
                        on ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border bg-surface-2/50 text-fg hover:border-border-strong')}>
                      <span className={cn('grid h-9 w-9 place-items-center rounded-xl', on ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-subtle')}>
                        <Icon size={18} />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}

                <button onClick={signOut}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-surface-2/50 p-3.5 text-left text-sm font-medium text-fg transition hover:border-danger/30 hover:bg-danger/10 hover:text-danger">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-3 text-subtle transition group-hover:bg-danger/15 group-hover:text-danger">
                    <LogOut size={18} />
                  </span>
                  Cerrar sesión
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
