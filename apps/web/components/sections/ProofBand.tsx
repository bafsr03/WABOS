import { Container } from '../ui';
import { Reveal } from '../Reveal';
import { Counter } from '../motion/Counter';

/**
 * Replaces the old <Stats> block, which advertised an invented "+1,200 negocios
 * activos". Every figure here is a property of the software itself, so it stays
 * true no matter how many customers exist.
 */
const ITEMS: { value: React.ReactNode; label: string }[] = [
  { value: <Counter value={6} />, label: 'herramientas que la IA puede usar sola' },
  { value: <>6–12 s</>, label: 'de espaciado entre envíos masivos' },
  { value: <>0</>, label: 'apps que tus clientes deben instalar' },
  { value: <>24/7</>, label: 'atención, también cuando cierras' },
];

export function ProofBand() {
  return (
    <Container className="py-16">
      <Reveal>
        <div className="card grid gap-6 p-8 sm:grid-cols-2 lg:grid-cols-4 lg:p-10">
          {ITEMS.map((s, i) => (
            <div key={i} className="text-center">
              <div className="tabular text-4xl font-semibold tracking-tight text-fg">{s.value}</div>
              <div className="mt-1.5 text-sm leading-snug text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </Container>
  );
}
