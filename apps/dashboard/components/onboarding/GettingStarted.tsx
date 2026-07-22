'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ArrowRight, Smartphone, ShoppingBag, Receipt, Bell, X } from 'lucide-react';
import { api, getFlag, setFlag } from '@/lib/api';
import { Card } from '@/components/ui/primitives';

interface Item { id: string; label: string; href: string; icon: typeof Check; done: boolean }

// A dismissible activation checklist on the Resumen dashboard. Each row's "done"
// is derived from real state (WhatsApp link, catalog, first sale, reports hour), so
// it flips live as the owner completes each step. `waConnected` comes from the
// page's ws subscription; `signal` bumps on ws events to trigger a refetch.
export default function GettingStarted({ waConnected, signal = 0 }: { waConnected: boolean; signal?: number }) {
  const [hidden, setHidden] = useState(true); // start hidden → avoid a flash before we know
  const [hasProduct, setHasProduct] = useState(false);
  const [hasSale, setHasSale] = useState(false);
  const [hasReports, setHasReports] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const refresh = useCallback(() => {
    api<any[]>('/api/products').then((p) => setHasProduct(p.length > 0)).catch(() => {});
    api<any[]>('/api/sales').then((s) => setHasSale(s.length > 0)).catch(() => {});
    api<Record<string, string>>('/api/settings').then((s) => setHasReports(Boolean(s.digest_hour))).catch(() => {});
  }, []);

  useEffect(() => { setHidden(getFlag('getting_started_hidden')); setLoaded(true); }, []);
  useEffect(() => { refresh(); }, [refresh, signal, waConnected]);

  const items: Item[] = [
    { id: 'connect', label: 'Conecta tu WhatsApp', href: '/connect', icon: Smartphone, done: waConnected },
    { id: 'product', label: 'Agrega un producto', href: '/catalog', icon: ShoppingBag, done: hasProduct },
    { id: 'sale', label: 'Registra tu primera venta', href: '/sales', icon: Receipt, done: hasSale },
    { id: 'reports', label: 'Activa tus reportes', href: '/settings?tab=caja', icon: Bell, done: hasReports },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Once everything's done, celebrate briefly, then collapse for good.
  useEffect(() => {
    if (allDone && loaded && !hidden && !celebrated) {
      setCelebrated(true);
      const t = setTimeout(() => { setFlag('getting_started_hidden', true); setHidden(true); }, 4000);
      return () => clearTimeout(t);
    }
  }, [allDone, loaded, hidden, celebrated]);

  function dismiss() { setFlag('getting_started_hidden', true); setHidden(true); }

  if (!loaded || hidden) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
        <Card className="relative overflow-hidden p-5">
          <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-24" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-fg">
                {allDone ? '¡Listo! 🎉 Tu negocio está en marcha' : 'Primeros pasos'}
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {allDone ? 'Completaste la configuración inicial.' : 'Configura lo esencial en un par de minutos.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-muted">{doneCount}/{items.length}</span>
              <button onClick={dismiss} aria-label="Ocultar" title="Ocultar" className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-fg">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* progress bar */}
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-brand" initial={false}
              animate={{ width: `${(doneCount / items.length) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
          </div>

          <div className="relative mt-3 space-y-1">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <Link key={it.id} href={it.href}
                  className={`group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition ${it.done ? 'opacity-60' : 'hover:bg-surface-2'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${it.done ? 'bg-brand text-white' : 'bg-surface-3 text-subtle group-hover:text-fg'}`}>
                    {it.done ? <Check size={16} /> : <Icon size={16} />}
                  </span>
                  <span className={`flex-1 text-sm font-medium ${it.done ? 'text-muted line-through' : 'text-fg'}`}>{it.label}</span>
                  {!it.done && <ArrowRight size={16} className="text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />}
                </Link>
              );
            })}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
