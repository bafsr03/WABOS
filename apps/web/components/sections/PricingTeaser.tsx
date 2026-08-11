import { ArrowRight, Check } from 'lucide-react';
import { Container, SectionHeading, Button } from '../ui';
import { Reveal } from '../Reveal';
import { PLANS, INCLUDED_EVERYWHERE } from '@/lib/plans';

/** Teaser only — the full table lives on /pricing and isn't duplicated here. */
export function PricingTeaser() {
  const cheapest = Math.min(...PLANS.map((p) => p.monthly));

  return (
    <Container className="py-20 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <SectionHeading
            eyebrow="Precios"
            title={`Desde S/${cheapest} al mes, todo incluido`}
            subtitle="Los planes solo cambian el volumen: cuántos contactos, productos y respuestas automáticas. Las funciones son las mismas en todos."
          />
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button href="/pricing" size="lg">Ver planes <ArrowRight size={16} /></Button>
          </div>
          <p className="mt-4 text-sm text-subtle">
            En soles, IGV incluido. Sin permanencia, cancelas cuando quieras.
          </p>
        </Reveal>

        <Reveal delay={0.1} blur>
          <div className="card p-7">
            <h3 className="text-sm font-semibold text-fg">Incluido en todos los planes</h3>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {INCLUDED_EVERYWHERE.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-muted">
                  <Check size={14} className="mt-0.5 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Container>
  );
}
