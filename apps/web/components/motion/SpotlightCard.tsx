'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Cursor-tracked sheen. Writes --mx/--my directly onto the element (no React
 * state — this fires on every pointermove). The `.spotlight` utility only
 * reveals itself under `@media (pointer: fine)`, so touch devices pay nothing.
 */
export function SpotlightCard({
  className, children, as: Tag = 'div',
}: { className?: string; children: React.ReactNode; as?: 'div' | 'article' }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      className={cn('spotlight', className)}
    >
      {children}
    </Tag>
  );
}
