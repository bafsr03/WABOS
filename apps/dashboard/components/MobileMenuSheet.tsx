'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { LogOut, Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/components/ui/primitives';
import BusinessSwitcher from '@/components/BusinessSwitcher';
import { useTheme } from '@/components/ThemeProvider';
import type { ThemePref } from '@/lib/theme';

export interface MenuItem { href: string; label: string; icon: LucideIcon }
export interface MenuGroup { group: string; items: MenuItem[] }

const WA_LABEL: Record<string, string> = { connected: 'Conectado', qr: 'Escanea QR', connecting: 'Conectando…', disconnected: 'Desconectado' };

/**
 * The mobile "Más" sheet: everything the floating bar doesn't have room for.
 *
 * It used to be a 2-column grid of thirteen identical cards, which gave Ajustes
 * the same visual weight as Inventario and read as a wall of chrome. It's now
 * the sidebar's own groups as compact rows — same structure on both sizes, so
 * learning one teaches the other.
 */
export default function MobileMenuSheet({ open, onClose, groups, activeHref, waStatus, onSignOut }: {
  open: boolean;
  onClose: () => void;
  groups: MenuGroup[];
  activeHref?: string;
  waStatus: string;
  onSignOut: () => void;
}) {
  const drag = useDragControls();
  const { pref: themePref, resolved: themeResolved, setPref: setThemePref } = useTheme();
  const cycleTheme = () => {
    const order: ThemePref[] = ['light', 'dark', 'system'];
    setThemePref(order[(order.indexOf(themePref) + 1) % order.length]);
  };
  const waTone = waStatus === 'connected' ? 'success' : waStatus === 'qr' || waStatus === 'connecting' ? 'warn' : 'danger';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="liquid-glass absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}>
            {/* Drag is bound to the handle only: the list below scrolls, and a
                sheet that also drags from its body swallows those flicks. */}
            <div onPointerDown={(e) => drag.start(e)}
              className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border-strong" />
            </div>

            <div className="shrink-0 px-4 pb-3"><BusinessSwitcher /></div>

            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
              {groups.map((g) => (
                <div key={g.group} className="mb-1.5">
                  <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.group}</p>
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface-2/50">
                    {g.items.map((item, i) => {
                      const Icon = item.icon;
                      const on = activeHref === item.href;
                      return (
                        <Link key={item.href} href={item.href} onClick={onClose}
                          className={cn('flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition',
                            i > 0 && 'border-t border-border',
                            on ? 'bg-brand/10 text-brand' : 'text-fg active:bg-surface-3')}>
                          <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', on ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-subtle')}>
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {/* Conexión carries the WhatsApp state — it's the page that
                              fixes it, so the status rides on its row instead of
                              taking a card of its own above the list. */}
                          {item.href === '/connect' && (
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                              <StatusDot tone={waTone} pulse={waStatus === 'connected'} />
                              {WA_LABEL[waStatus] ?? waStatus}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Not destinations — they act on the session, so they sit apart from
                the map instead of posing as two more pages. Theme cycles in place
                (the canonical 3-way control lives in Ajustes → Apariencia) and the
                sheet stays open so the change is visible. */}
            <div className="shrink-0 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="grid grid-cols-2 gap-2">
              <button onClick={cycleTheme}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2/50 py-2.5 text-sm font-medium text-fg transition active:bg-surface-3">
                {themePref === 'system' ? <Monitor size={16} /> : themeResolved === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                Tema · {themePref === 'system' ? 'Auto' : themeResolved === 'dark' ? 'Oscuro' : 'Claro'}
              </button>
              <button onClick={onSignOut}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2/50 py-2.5 text-sm font-medium text-muted transition active:border-danger/30 active:bg-danger/10 active:text-danger">
                <LogOut size={16} />
                Cerrar sesión
              </button>
              </div>
              {/* Temporary. Installed to the home screen there is no address
                  bar, so this link is the only way to open the screen
                  diagnostics from inside the app — which is the one place the
                  numbers mean anything, since standalone is where the layout
                  differs. Goes away with NavDebug. */}
              <Link href="/diag" onClick={onClose}
                className="mt-2 block text-center text-[11px] text-subtle">
                Diagnóstico de pantalla
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
