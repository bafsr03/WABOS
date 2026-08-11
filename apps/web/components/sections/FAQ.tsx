import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';
import type { Faq } from '@/lib/faqs';

export function FAQ({ items, title = 'Preguntas frecuentes' }: { items: Faq[]; title?: string }) {
  return (
    <Container className="py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal><SectionHeading eyebrow="FAQ" title={title} /></Reveal>
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
      </div>
    </Container>
  );
}
