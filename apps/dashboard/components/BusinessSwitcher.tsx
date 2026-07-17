'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { getMe, getBusinessId, setBusinessId, createBusiness, type BusinessLite } from '@/lib/api';
import { Avatar, Badge, Button, Input } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';

const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };

// Workspace switcher for accounts that own more than one business. Persists the
// active business id (sent as X-Business-Id by lib/api) and reloads on switch so
// every query + the websocket re-scope to the chosen tenant.
export default function BusinessSwitcher() {
  const [businesses, setBusinesses] = useState<BusinessLite[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe()
      .then(({ user, businesses }) => {
        setBusinesses(businesses);
        setCanCreate(!!user); // legacy-token sessions can't create workspaces
        const persisted = Number(getBusinessId());
        const active = businesses.find((b) => b.id === persisted) ?? businesses[0];
        if (active) {
          setCurrentId(active.id);
          if (!persisted || !businesses.some((b) => b.id === persisted)) setBusinessId(active.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function switchTo(id: number) {
    if (id === currentId) { setOpen(false); return; }
    setBusinessId(id);
    window.location.reload();
  }

  async function submitNew() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const b = await createBusiness(name.trim());
      setBusinessId(b.id);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const current = businesses.find((b) => b.id === currentId);
  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 py-2 text-left transition hover:border-border-strong"
      >
        <Avatar name={current.name || 'Espacio'} className="h-7 w-7 text-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{current.name || 'Mi espacio'}</span>
          <span className="block text-[10px] uppercase tracking-wide text-subtle">{TIER_LABEL[current.plan_tier] ?? current.plan_tier}</span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-subtle" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]"
          >
            <div className="max-h-64 overflow-y-auto p-1">
              {businesses.map((b) => (
                <button
                  key={b.id}
                  onClick={() => switchTo(b.id)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface-2',
                    b.id === currentId ? 'text-fg' : 'text-muted')}
                >
                  <Avatar name={b.name || 'Espacio'} className="h-6 w-6 text-[9px]" />
                  <span className="min-w-0 flex-1 truncate">{b.name || 'Mi espacio'}</span>
                  <Badge tone={b.plan_tier === 'free' ? 'neutral' : 'brand'}>{TIER_LABEL[b.plan_tier] ?? b.plan_tier}</Badge>
                  {b.id === currentId && <Check size={15} className="shrink-0 text-brand" />}
                </button>
              ))}
            </div>
            {canCreate && (
              <button
                onClick={() => { setOpen(false); setCreating(true); }}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                <Plus size={15} /> Nuevo espacio
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo espacio de trabajo">
        <p className="text-sm text-muted">Crea otro negocio bajo tu cuenta. Cambiarás a él automáticamente.</p>
        <Input
          autoFocus className="mt-4" placeholder="Nombre del negocio" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); }}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          <Button onClick={submitNew} disabled={!name.trim() || busy}>{busy ? 'Creando…' : 'Crear espacio'}</Button>
        </div>
      </Modal>
    </div>
  );
}
