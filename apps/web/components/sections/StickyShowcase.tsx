'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Container, SectionHeading } from '../ui';

export interface ShowcaseItem {
  key: string;
  label: string;
  title: string;
  desc: string;
  media: React.ReactNode;
}

/**
 * Scroll-linked module tour. Sticky only from `lg` up — below that it degrades
 * to a plain stacked list, because sticky-scroll on a phone is a usability trap.
 */
export function StickyShowcase({
  eyebrow, heading, subtitle, items,
}: { eyebrow: string; heading: string; subtitle?: string; items: ShowcaseItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  // Keep only the *index* in React state — never the raw scroll value, which
  // would re-render every frame.
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(items.length - 1, Math.max(0, Math.floor(v * items.length)));
    setActive((prev) => (prev === next ? prev : next));
  });

  return (
    <section className="py-20 lg:py-28">
      <Container>
        <SectionHeading center eyebrow={eyebrow} title={heading} subtitle={subtitle} />
      </Container>

      {/* Mobile / reduced-motion: stacked list, no sticky, no scroll driving. */}
      <Container className="mt-12 space-y-10 lg:hidden">
        {items.map((it) => (
          <div key={it.key}>
            <h3 className="text-lg font-semibold text-fg">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{it.desc}</p>
            <div className="mt-5">{it.media}</div>
          </div>
        ))}
      </Container>

      {/* Desktop: sticky two-column with scroll-linked media. */}
      <div ref={ref} className="hidden lg:block" style={{ height: `${items.length * 75}vh` }}>
        {/* Centered in the viewport rather than pinned to the top: the media is
            shorter than the screen, so top-pinning left a large dead zone. */}
        <div className="sticky top-0 flex min-h-screen items-center">
          <Container>
            <div className="grid grid-cols-2 items-center gap-16">
              <div>
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={it.key}>
                      <button
                        type="button"
                        onClick={() => setActive(i)}
                        className={cn(
                          'w-full border-l-2 py-4 pl-5 text-left transition-colors',
                          i === active ? 'border-brand' : 'border-border hover:border-border-strong',
                        )}
                      >
                        <span className={cn('text-xs font-semibold uppercase tracking-wider', i === active ? 'text-brand-glow' : 'text-subtle')}>
                          {it.label}
                        </span>
                        <span className={cn('mt-1 block text-lg font-semibold', i === active ? 'text-fg' : 'text-muted')}>
                          {it.title}
                        </span>
                        <AnimatePresence initial={false}>
                          {i === active && (
                            <motion.span
                              initial={reduced ? undefined : { opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={reduced ? undefined : { opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="block overflow-hidden"
                            >
                              <span className="mt-2 block text-sm leading-relaxed text-muted">{it.desc}</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative">
                <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-brand/10 blur-3xl" />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={items[active].key}
                    initial={reduced ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {items[active].media}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </Container>
        </div>
      </div>
    </section>
  );
}
