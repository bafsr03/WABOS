import { AlertTriangle } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';
import { DividedList } from './DividedList';

/**
 * Was PainGrid — a 6-card icon grid, which made it the third of six sections
 * on the landing page with that same shape. Now a divided list with a
 * left-aligned heading: denser, faster to read, and structurally distinct from
 * everything around it.
 *
 * Trimmed 6 → 4: the two cut pains ("saltas entre cuatro apps", "contestas lo
 * mismo 50 veces") are implied by the ones that remain and by the hero.
 */
const PAINS = [
  {
    title: 'Contestas a las once de la noche',
    desc: 'Y si no contestas, el cliente le compra al de al lado. Tu horario de atención terminó decidiéndolo WhatsApp.',
  },
  {
    title: 'Te mandan capturas que no son',
    desc: 'Una imagen editada, un pago que nunca entró, y te enteras al día siguiente cuando por fin miras el banco.',
  },
  {
    title: 'No sabes cuánto te queda',
    desc: 'Sabes cuánto vendiste. Cuánto te quedó después del costo, las comisiones y los gastos del día es otra conversación.',
  },
  {
    title: 'Persigues a los que quedaron debiendo',
    desc: 'Escribir “hola, te recuerdo el pago” es incómodo. Por eso muchas veces simplemente no lo haces, y ese dinero no vuelve.',
  },
];

export function ProblemList() {
  return (
    <section className="border-y border-border bg-bg-tint py-20 lg:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              eyebrow="Te suena"
              title="Vender por WhatsApp funciona. Sostenerlo es otra cosa."
              subtitle="Nada de esto pasa por hacer mal el trabajo. Pasa por sostener un negocio entero con herramientas que nunca se diseñaron para vender."
            />
          </Reveal>
          <Reveal delay={0.1}>
            <DividedList items={PAINS} icon={AlertTriangle} tone="danger" />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
