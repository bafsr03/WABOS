'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGroup, motion } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Users, ShoppingBag, Wallet, Megaphone,
  Smartphone, Settings, LogOut, Plus, MoreHorizontal, X, Sparkles, Bot, BookOpen, BarChart3,
  Receipt, Coins, Boxes, type LucideIcon,
} from 'lucide-react';
import { api, clearToken, getToken, getStatus, getFlag, setFlag } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/components/ui/primitives';
import BusinessSwitcher from '@/components/BusinessSwitcher';
import MobileMenuSheet from '@/components/MobileMenuSheet';
import InstallPrompt from '@/components/InstallPrompt';
import NavDebug from '@/components/NavDebug';
import Tour from '@/components/onboarding/Tour';
import { TOUR_STEPS } from '@/components/onboarding/steps';
import { ThemeToggle } from '@/components/ThemeToggle';
import { unsubscribeFromPush } from '@/lib/push';
import { unregisterNativePush } from '@/lib/native';

interface NavItem { href: string; label: string; icon: LucideIcon }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ href: '/', label: 'Resumen', icon: LayoutDashboard }] },
  { group: 'Operación', items: [
    { href: '/inbox', label: 'Inbox', icon: MessageCircle },
    { href: '/contacts', label: 'Contactos', icon: Users },
    { href: '/catalog', label: 'Catálogo', icon: ShoppingBag },
    { href: '/inventory', label: 'Inventario', icon: Boxes },
    { href: '/knowledge', label: 'Conocimiento', icon: BookOpen },
    { href: '/agents', label: 'Agentes IA', icon: Bot },
    { href: '/voice', label: 'ADN de voz', icon: Sparkles },
  ] },
  { group: 'Caja', items: [
    { href: '/sales', label: 'Punto de venta', icon: Receipt },
    { href: '/cashflow', label: 'Caja', icon: Coins },
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
  { href: '/sales', label: 'Punto de venta', icon: Receipt },
];
// Everything not already in the bar, kept in the sidebar's own groups so the menu
// and the desktop nav tell the same story. A flat grid of 13 identical cards gave
// Inventario the same weight as Ajustes and read as a wall — the group headings
// are what make it scannable.
const OVERFLOW_GROUPS: { group: string; items: NavItem[] }[] = NAV
  .map((g) => ({ group: g.group, items: g.items.filter((i) => !PRIMARY.some((p) => p.href === i.href)) }))
  .filter((g) => g.items.length > 0);
const OVERFLOW: NavItem[] = OVERFLOW_GROUPS.flatMap((g) => g.items);
const WA_LABEL: Record<string, string> = { connected: 'Conectado', qr: 'Escanea QR', connecting: 'Conectando…', disconnected: 'Desconectado' };
// data-tour anchors — shared by the desktop sidebar link and the mobile pill for
// each destination, so the first-run tour highlights whichever is on screen.
const TOUR_ANCHOR: Record<string, string> = {
  '/connect': 'connect', '/catalog': 'catalog', '/sales': 'sales', '/cashflow': 'cashflow', '/inbox': 'inbox',
};

/**
 * `fill` — for pages that lay themselves out to the full height instead of
 * scrolling (the inbox thread, with its pinned composer). They keep the bottom
 * bar clear themselves, on the element that actually ends at the screen bottom,
 * so they must not also inherit <main>'s clearance — counting it twice is what
 * pushed the whole page up and made the bar look higher there than elsewhere.
 */
export default function Shell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [waStatus, setWaStatus] = useState('...');
  const [sheet, setSheet] = useState(false);
  const [overCap, setOverCap] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

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

  // First-run product tour: open on ?tour=1 (replay), or once for a new owner who
  // hasn't completed it (localStorage gate first, then confirm against settings so
  // it doesn't re-nag on a second device).
  useEffect(() => {
    if (!ready) return;
    const replay = new URLSearchParams(window.location.search).get('tour') === '1';
    if (replay) { setTourOpen(true); return; }
    if (getFlag('onboarding_done')) return;
    let cancelled = false;
    api<Record<string, string>>('/api/settings')
      .then((s) => { if (cancelled) return; if (s.onboarding_done === '1') setFlag('onboarding_done', true); else setTourOpen(true); })
      .catch(() => { if (!cancelled) setTourOpen(true); });
    return () => { cancelled = true; };
  }, [ready]);

  const endTour = () => { setFlag('onboarding_done', true); setTourOpen(false); };

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
          <img src="/logo.png" alt="WABOS" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
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
                  <Link key={item.href} href={item.href} onClick={onNavigate} data-tour={TOUR_ANCHOR[item.href]}
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

      <div className="space-y-2 border-t border-border p-3">
        <ThemeToggle compact />
        <button onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-danger">
          <LogOut size={17} /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  const overflowActive = OVERFLOW.some((i) => active?.href === i.href);
  const barPill = 'liquid-glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5';
  const navSpring = { type: 'spring', stiffness: 480, damping: 34, mass: 0.8 } as const;
  const tabCls = (on: boolean) =>
    cn('relative grid h-11 w-11 place-items-center rounded-full transition-colors',
      on ? 'text-brand' : 'text-subtle hover:bg-surface-2/60 hover:text-fg');
  // Shared inner content for every tab: the sliding highlight (only on the active
  // tab — one layoutId="navHighlight" mounted at a time, so framer glides it from
  // the old tab to the new one) plus a springy, popping icon.
  const tabInner = (Icon: LucideIcon, on: boolean) => (
    <>
      {on && (
        <motion.span layoutId="navHighlight" transition={navSpring}
          className="absolute inset-0 rounded-full bg-brand/15 ring-1 ring-inset ring-brand/25" />
      )}
      <motion.span className="relative" whileTap={{ scale: 0.85 }} animate={{ scale: on ? 1.06 : 1 }} transition={navSpring}>
        <Icon size={21} />
      </motion.span>
    </>
  );

  return (
    // Height comes straight from --app-h (window.innerHeight, see
    // ViewportScript) rather than from `h-full`: a percentage against a body
    // sized with -webkit-fill-available resolves to auto on iOS, which made this
    // box as tall as the page's content and let the document scroll under a
    // `fixed` bar. `relative` then makes it the containing block for that bar,
    // so the bar is placed against a box the app measured itself instead of
    // against whatever the web view currently calls the viewport.
    <div data-shell className="relative flex h-[var(--app-h,100%)] overflow-hidden bg-bg text-fg">
      {/* Static sidebar (desktop) */}
      <aside className="relative hidden w-60 shrink-0 border-r border-border lg:block">{sidebar()}</aside>

      {/* Content — no title bar (each page renders its own PageHeader).
          padding-top = env(safe-area-inset-top) so page content clears the iOS
          clock; it resolves to 0 on desktop, leaving that layout unchanged. */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {overCap && (
          <Link href="/settings?billing=cap" className="flex items-center gap-2 border-b border-danger/20 bg-danger/10 px-4 py-2 text-xs font-medium text-danger transition hover:bg-danger/16 sm:px-6">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-danger/20">!</span>
            Alcanzaste el límite de mensajes de IA de tu plan — la IA dejó de responder. Actualiza para reactivarla.
          </Link>
        )}
        {/* Deliberately NOT a flex container: a scroller with display:flex drops
            its own padding-bottom from the scrollable area (measured: 2226px vs
            2362px on the same page), which would let the floating bar cover the
            last card. PageBody fills the height with min-h-full, which needs no
            flex parent, and this padding is what keeps "full" clear of the bar. */}
        <main className={cn('aurora min-h-0 flex-1 overflow-y-auto overscroll-contain', !fill && 'pb-[var(--nav-clearance)]')}>{children}</main>
      </div>

      <InstallPrompt />

      <NavDebug />

      <Tour steps={TOUR_STEPS} open={tourOpen} onClose={endTour} onFinish={endTour} />

      {/* Floating bottom bar (mobile) — Whop-style grouped pills. LayoutGroup lets the
          single navHighlight glide across both pills (primary tabs ↔ "Más" button). */}
      <LayoutGroup>
        {/* absolute, not fixed — see the shell root. Geometry lives in --nav-*
            (globals.css) so everything that has to clear this bar measures it
            the same way. */}
        <div data-nav-bar className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 px-3 pb-[var(--nav-inset)] lg:hidden">
          <nav className={barPill}>
            {PRIMARY.map((item) => (
              <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} data-tour={TOUR_ANCHOR[item.href]} className={tabCls(active?.href === item.href)}>
                {tabInner(item.icon, active?.href === item.href)}
              </Link>
            ))}
          </nav>
          <div className={barPill}>
            <button onClick={() => setSheet(true)} aria-label="Más opciones" title="Más" className={tabCls(overflowActive)}>
              {tabInner(MoreHorizontal, overflowActive)}
            </button>
            <Link href="/sales" aria-label="Nueva venta" title="Nueva venta"
              className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-[var(--shadow-card)] transition hover:bg-brand-strong">
              <motion.span whileTap={{ scale: 0.85 }} transition={navSpring}><Plus size={21} /></motion.span>
            </Link>
          </div>
        </div>
      </LayoutGroup>

      <MobileMenuSheet
        open={sheet}
        onClose={() => setSheet(false)}
        groups={OVERFLOW_GROUPS}
        activeHref={active?.href}
        waStatus={waStatus}
        onSignOut={signOut}
      />

    </div>
  );
}
