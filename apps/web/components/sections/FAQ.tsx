import { cn } from '@/lib/cn';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';
import type { Faq } from '@/lib/faqs';

/**
 * `center` renders a single centered column instead of the two-column split.
 * The landing page uses it so the FAQ doesn't share a fingerprint with the
 * pricing strip directly above it; /pricing keeps the two-column form.
 */
export function FAQ({
  items, title = 'Preguntas frecuentes', center, className,
}: { items: Faq[]; title?: string; center?: boolean; className?: string }) {
  const list = (
    <div className="card divide-y divide-border overflow-hidden">
      {items.map((it) => (
        <details key={it.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-fg">
            {it.q}
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );

  if (center) {
    return (
      <div className={cn('mx-auto max-w-3xl', className)}>
        <Reveal><SectionHeading center title={title} className="mx-auto" /></Reveal>
        <Reveal delay={0.1} className="mt-10">{list}</Reveal>
      </div>
    );
  }

  return (
    <Container className={cn('py-20 lg:py-24', className)}>
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal><SectionHeading eyebrow="FAQ" title={title} /></Reveal>
        {list}
      </div>
    </Container>
  );
}
