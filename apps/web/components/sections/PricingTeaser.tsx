import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Container, SectionHeading, Button } from '../ui';
import { Reveal } from '../Reveal';
import { PLANS } from '@/lib/plans';
import { Counter } from '../motion/Counter';

/**
 * A horizontal price strip, not a card grid.
 *
 * The old version rendered the full INCLUDED_EVERYWHERE checklist, which
 * /pricing also renders in near-identical markup. That list belongs to /pricing
 * — the page where someone is actually comparing. Here we only need the entry
 * price and the one idea that makes the ladder easy to understand.
 */
export function PricingTeaser() {
  const selfServe = PLANS.filter((p) => p.id !== 'enterprise');
  const cheapest = Math.min(...selfServe.map((p) => p.monthly));

  return (
    <Container className="pt-20 lg:pt-24">
      <Reveal>
        <SectionHeading
          center
          eyebrow="Precios"
          title={<>Desde <span className="tabular">S/<Counter value={cheapest} /></span> al mes</>}
          subtitle="Todos los planes traen las mismas funciones. Lo único que cambia es el tamaño: cuántos contactos, cuántos productos y cuántas respuestas automáticas al mes."
        />
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-stretch justify-center gap-3">
          {selfServe.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex-1 rounded-2xl border px-5 py-4 text-center',
                p.popular ? 'glow-border border-transparent bg-surface' : 'border-border bg-surface',
              )}
            >
              <div className="text-xs font-medium text-muted">{p.name}</div>
              <div className="tabular mt-1 text-2xl font-semibold text-fg">S/{p.monthly}</div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button href="/pricing" size="lg">Ver qué incluye cada plan <ArrowRight size={16} /></Button>
          <p className="text-sm text-subtle">En soles, IGV incluido. Sin permanencia.</p>
        </div>
      </Reveal>
    </Container>
  );
}
