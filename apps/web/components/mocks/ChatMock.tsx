'use client';

import { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, ShieldCheck, FileImage, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------------------------------------------------------------------------
   A conversation is declared as a list of beats, not hand-timed markup, so the
   same component can play different stories on different pages.
--------------------------------------------------------------------------- */
export type Beat =
  | { t: 'in'; text: string }
  | { t: 'typing'; ms?: number }
  | { t: 'out'; text: string; time?: string }
  | { t: 'receipt'; label?: string; caption?: string; time?: string }
  | { t: 'verifying'; ms?: number }
  | { t: 'verified'; amount: string; note?: string; time?: string };

/** How long each beat is displayed before the next one appears. */
const DWELL: Record<Beat['t'], number> = {
  in: 900, typing: 1200, out: 1000, receipt: 1100, verifying: 1600, verified: 3600,
};

const beatDuration = (b: Beat) =>
  (b.t === 'typing' || b.t === 'verifying') && b.ms ? b.ms : DWELL[b.t];

/** The default story: question → price → charge → receipt → verified. */
export const SALES_SCRIPT: Beat[] = [
  { t: 'in', text: 'Hola, ¿tienen gaseosa de 3 litros? ¿a cuánto?' },
  { t: 'typing', ms: 1100 },
  { t: 'out', text: '¡Hola! 👋 Sí, tenemos Inca Kola 3L a S/ 9.50. ¿Te la aparto?', time: '9:41' },
  { t: 'in', text: 'Sí, quiero 2. ¿Yape?' },
  { t: 'typing', ms: 900 },
  { t: 'out', text: 'Claro 🙌 Son S/ 19.00. Yapea al 987 654 321 y mándame la captura.', time: '9:41' },
  { t: 'receipt', label: 'comprobante.jpg', caption: 'Listo, ahí está ✅', time: '9:43' },
  { t: 'verifying', ms: 1600 },
  { t: 'verified', amount: 'S/ 19.00', note: '¡Gracias por tu compra! 🎉', time: '9:43' },
];

/** Inbox story — no payment, ends in a human handoff. */
export const HANDOFF_SCRIPT: Beat[] = [
  { t: 'in', text: 'Buenas, ¿hacen delivery a Surco hoy?' },
  { t: 'typing', ms: 1000 },
  { t: 'out', text: 'Sí, llegamos a Surco. Los pedidos antes de las 6pm salen el mismo día.', time: '18:02' },
  { t: 'in', text: 'Necesito factura a nombre de mi empresa, ¿se puede?' },
  { t: 'typing', ms: 900 },
  { t: 'out', text: 'Te paso con alguien del equipo para coordinar la factura 👤', time: '18:03' },
];

type State = { shown: number; phase: 'playing' | 'resetting' };
type Action = { type: 'next' } | { type: 'reset' } | { type: 'all' };

function reducer(state: State, action: Action, total: number): State {
  switch (action.type) {
    case 'next':
      return state.shown >= total ? { shown: total, phase: 'resetting' } : { ...state, shown: state.shown + 1 };
    case 'reset':
      return { shown: 0, phase: 'playing' };
    case 'all':
      return { shown: total, phase: 'playing' };
  }
}

export function ChatMock({
  script = SALES_SCRIPT,
  title = 'Minimarket Perú',
  subtitle = 'Empleado IA activo',
  ariaLabel,
  className,
}: {
  script?: Beat[];
  title?: string;
  subtitle?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();

  const [state, dispatch] = useReducer(
    (s: State, a: Action) => reducer(s, a, script.length),
    { shown: 0, phase: 'playing' as const },
  );

  // Reduced motion: show the whole conversation at once, never an empty phone.
  useEffect(() => {
    if (reduced) dispatch({ type: 'all' });
  }, [reduced]);

  // Step machine. Only starts once the mock is actually on screen.
  useEffect(() => {
    if (reduced || !inView) return;

    if (state.phase === 'resetting') {
      const id = setTimeout(() => dispatch({ type: 'reset' }), 2600);
      return () => clearTimeout(id);
    }
    if (state.shown >= script.length) { dispatch({ type: 'next' }); return; }

    const id = setTimeout(() => dispatch({ type: 'next' }), beatDuration(script[state.shown]));
    return () => clearTimeout(id);
  }, [inView, reduced, state.shown, state.phase, script]);

  // Keep the newest bubble in view inside the fixed-height thread.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [state.shown, reduced]);

  // "typing" and "verifying" are transient states, not messages: they only show
  // while they're the newest beat, then the real bubble replaces them.
  const visible = script
    .slice(0, state.shown)
    .filter((b, i, arr) => (b.t !== 'typing' && b.t !== 'verifying') || i === arr.length - 1);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel ?? 'Conversación de ejemplo en WhatsApp: un cliente pregunta por un producto, el Empleado IA responde con el precio, cobra por Yape y WABOS verifica el comprobante.'}
      className={cn('glow-border overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-[var(--shadow-lg)]', className)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-wa-deep px-4 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-[13px] font-semibold text-white">
          {title.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <ShieldCheck size={11} /> {subtitle}
          </div>
        </div>
        <span className="pulse-ring h-2.5 w-2.5 rounded-full bg-wa" />
      </div>

      {/* Thread — fixed height so appending a bubble never reflows the page. */}
      <div
        ref={bodyRef}
        aria-hidden
        // Bottom-anchored like a real chat, so a half-played thread doesn't
        // float in an empty box. Fixed height keeps appended bubbles from
        // reflowing the hero.
        className="flex h-[420px] flex-col justify-end gap-2 overflow-hidden bg-wa-wallpaper px-3 py-4"
      >
        <AnimatePresence initial={false}>
          {visible.map((beat, i) => (
            <Bubble key={`${beat.t}-${i}`} beat={beat} reduced={!!reduced} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 30 };

function Bubble({ beat, reduced }: { beat: Beat; reduced: boolean }) {
  const anim = reduced
    ? {}
    : { initial: { opacity: 0, y: 8, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: spring };

  const shell = 'max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm';

  if (beat.t === 'in') {
    return (
      <motion.div {...anim} className="flex justify-start">
        <div className={cn(shell, 'rounded-tl-sm bg-white text-[#111b21]')}>{beat.text}</div>
      </motion.div>
    );
  }

  if (beat.t === 'typing') {
    return (
      <motion.div {...anim} className="flex justify-end">
        <div className={cn(shell, 'rounded-tr-sm bg-wa-bubble')}>
          <span className="flex gap-1 py-0.5">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-[#667781]"
                animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
                transition={reduced ? undefined : { duration: 1.1, repeat: Infinity, delay: d * 0.15 }}
              />
            ))}
          </span>
        </div>
      </motion.div>
    );
  }

  if (beat.t === 'out') {
    return (
      <motion.div {...anim} className="flex justify-end">
        <div className={cn(shell, 'rounded-tr-sm bg-wa-bubble text-[#111b21]')}>
          {beat.text}
          <Meta time={beat.time} />
        </div>
      </motion.div>
    );
  }

  if (beat.t === 'receipt') {
    return (
      <motion.div {...anim} className="flex justify-start">
        <div className={cn(shell, 'rounded-tl-sm bg-white text-[#111b21]')}>
          <span className="mb-1.5 flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-2 py-1.5">
            <span className="grid h-6 w-6 place-items-center rounded bg-[#6d28d9] text-[9px] font-bold text-white">Yape</span>
            <span className="flex items-center gap-1 text-[11px] text-[#54656f]">
              <FileImage size={11} /> {beat.label ?? 'comprobante.jpg'}
            </span>
          </span>
          {beat.caption}
          <Meta time={beat.time} inbound />
        </div>
      </motion.div>
    );
  }

  if (beat.t === 'verifying') {
    return (
      <motion.div {...anim} className="flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#fff3cd] px-3 py-1.5 text-[11px] font-medium text-[#7a5b00]">
          <Loader2 size={12} className={reduced ? undefined : 'animate-spin'} />
          Verificando pago contra tu banco…
        </span>
      </motion.div>
    );
  }

  // verified — the emotional payload of the whole page.
  return (
    <motion.div {...anim} className="flex justify-end">
      <div className={cn(shell, 'rounded-tr-sm bg-wa-bubble text-[#111b21]')}>
        <span className="mb-1 flex items-center gap-1.5 font-semibold text-[#0a7d32]">
          <motion.span
            initial={reduced ? undefined : { scale: 0.6, opacity: 0 }}
            animate={reduced ? undefined : { scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}
            className="grid place-items-center"
          >
            <ShieldCheck size={14} />
          </motion.span>
          Pago verificado — {beat.amount}
        </span>
        {beat.note}
        <Meta time={beat.time} />
      </div>
    </motion.div>
  );
}

function Meta({ time, inbound }: { time?: string; inbound?: boolean }) {
  if (!time) return null;
  return (
    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
      {time}
      {!inbound && (
        <span className="flex -space-x-1 text-[#53bdeb]">
          <Check size={11} /><Check size={11} />
        </span>
      )}
    </span>
  );
}
