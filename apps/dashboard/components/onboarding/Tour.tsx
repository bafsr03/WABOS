'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/primitives';
import type { TourStep } from './steps';

interface Rect { top: number; left: number; width: number; height: number }
type Placement = 'top' | 'bottom' | 'left' | 'right';

const PAD = 8;   // spotlight padding around the target
const GAP = 14;  // popover distance from the target
const M = 12;    // viewport margin
const spring = { type: 'spring', stiffness: 460, damping: 40, mass: 0.9 } as const;

// Resolve the currently-visible element for a data-tour id (sidebar link on
// desktop, bottom-bar pill on mobile — whichever is actually laid out) and
// scroll it into view before measuring.
function measure(sel?: string): Rect | null {
  if (!sel) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${sel}"]`));
  const el = els.find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0);
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function Tour({ steps, open, onClose, onFinish }: {
  steps: TourStep[]; open: boolean; onClose: () => void; onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const next = useCallback(() => (isLast ? onFinish() : setIndex((i) => i + 1)), [isLast, onFinish]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  // (Re)measure the target on step change and whenever the layout shifts.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setRect(measure(step?.target));
    update();
    // A tick later too — the sidebar/nav can settle after the first frame.
    const t = setTimeout(update, 60);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, index, step?.target]);

  // Place the popover beside the target (or center it when there's no target).
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) { setPos({ top: (vh - ph) / 2, left: (vw - pw) / 2 }); return; }

    const fits: Record<Placement, boolean> = {
      right: vw - (rect.left + rect.width) >= pw + GAP + M,
      left: rect.left >= pw + GAP + M,
      bottom: vh - (rect.top + rect.height) >= ph + GAP + M,
      top: rect.top >= ph + GAP + M,
    };
    const order: Placement[] = [step?.placement ?? 'right', 'right', 'bottom', 'top', 'left'];
    const chosen = order.find((p) => fits[p]) ?? 'bottom';

    let top = 0, left = 0;
    if (chosen === 'right') { left = rect.left + rect.width + GAP; top = rect.top + rect.height / 2 - ph / 2; }
    else if (chosen === 'left') { left = rect.left - GAP - pw; top = rect.top + rect.height / 2 - ph / 2; }
    else if (chosen === 'bottom') { top = rect.top + rect.height + GAP; left = rect.left + rect.width / 2 - pw / 2; }
    else { top = rect.top - GAP - ph; left = rect.left + rect.width / 2 - pw / 2; }

    setPos({
      top: Math.min(Math.max(top, M), vh - ph - M),
      left: Math.min(Math.max(left, M), vw - pw - M),
    });
  }, [rect, index, step?.placement]);

  // Keyboard: Esc skips, arrows/enter navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, onClose]);

  return (
    <AnimatePresence>
      {open && step && (
        <div className="fixed inset-0 z-[9490]" role="dialog" aria-modal="true" aria-label="Recorrido de bienvenida">
          {/* Click catcher — blocks the page underneath; backdrop clicks are a no-op. */}
          {!rect && (
            <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] dark:bg-black/72"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
          {rect && (
            <>
              <div className="absolute inset-0" />
              <motion.div
                className="pointer-events-none absolute rounded-2xl ring-2 ring-brand/70"
                initial={false}
                animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
                transition={spring}
                // Token, not a literal: an inline style can't take a dark: variant.
                style={{ boxShadow: '0 0 0 9999px var(--tour-scrim)' }}
              />
            </>
          )}

          {/* Popover — centered via flexbox when there's no target (welcome/finish),
              absolutely positioned beside the target otherwise. */}
          <div className={rect ? 'contents' : 'pointer-events-none absolute inset-0 flex items-center justify-center p-3'}>
            <motion.div
              ref={popRef}
              className={`glass pointer-events-auto z-[9500] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-4 shadow-2xl ${rect ? 'absolute' : ''}`}
              style={rect ? { top: pos.top, left: pos.left } : undefined}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <h3 className="font-display text-base font-semibold text-fg">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {steps.map((s, i) => (
                    <span key={s.id}
                      className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-brand' : 'w-1.5 bg-border-strong'}`} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {index === 0
                    ? <Button variant="ghost" size="sm" onClick={onClose}>Saltar</Button>
                    : <Button variant="ghost" size="sm" onClick={prev}>Atrás</Button>}
                  <Button size="sm" onClick={next}>{index === 0 ? 'Empezar' : isLast ? 'Listo' : 'Siguiente'}</Button>
                </div>
              </div>

              {index > 0 && !isLast && (
                <button onClick={onClose} className="mt-2 block w-full text-center text-xs text-subtle transition hover:text-muted">
                  Saltar recorrido
                </button>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
