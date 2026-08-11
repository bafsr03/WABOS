'use client';

import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

const fmt = (n: number, decimals: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

/**
 * Counts up when scrolled into view. Writes straight to the DOM node rather
 * than through state — otherwise this re-renders ~60×/second.
 */
export function Counter({
  value, decimals = 0, prefix = '', suffix = '', className,
}: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced || !inView) {
      if (reduced) el.textContent = `${prefix}${fmt(value, decimals)}${suffix}`;
      return;
    }

    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = `${prefix}${fmt(v, decimals)}${suffix}`; },
    });
    return () => controls.stop();
  }, [inView, reduced, value, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {/* Server-rendered final value: correct for crawlers and for no-JS. */}
      {`${prefix}${fmt(value, decimals)}${suffix}`}
    </span>
  );
}
