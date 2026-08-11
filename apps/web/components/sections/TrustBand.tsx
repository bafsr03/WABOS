import { Wallet, Clock, Download, Smartphone } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal, RevealStagger, RevealItem } from '../Reveal';
import { SpotlightCard } from '../motion/SpotlightCard';

/**
 * Replaces the old PeruBand + OwnershipBand, which were adjacent and
 * character-identical apart from icon tint. One section, two ideas: it's built
 * for how business is done here, and nothing about it locks you in.
 *
 * This section owns the "tus datos son tuyos" claim — /about should not restate
 * the CSV-export line.
 *
 * It is deliberately the only icon-card grid left on the landing page, so the
 * format reads as a choice rather than the default.
 */
const ITEMS = [
  {
    icon: Wallet,
    tint: 'bg-wa/10 text-wa',
    title: 'Yape, Plin y transferencias',
    desc: 'Los medios con los que de verdad te pagan, entendidos de fábrica. Precios y reportes en soles, con IGV donde corresponde.',
  },
  {
    icon: Clock,
    tint: 'bg-wa/10 text-wa',
    title: 'Habla y cierra como acá',
    desc: 'La IA responde en el español que usan tus clientes, y el cierre del día cuadra con tu jornada, no con otro huso horario.',
  },
  {
    icon: Download,
    tint: 'bg-brand/10 text-brand',
    title: 'Tus datos salen contigo',
    desc: 'Exporta tu catálogo y tu información en CSV cuando quieras. El sistema además guarda respaldos automáticos.',
  },
  {
    icon: Smartphone,
    tint: 'bg-brand/10 text-brand',
    title: 'Tu número sigue siendo tuyo',
    desc: 'Se vincula como un dispositivo más y se desvincula con un clic. Importar tus conversaciones anteriores es opcional y lo decides tú.',
  },
];

export function TrustBand() {
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            center
            eyebrow="Sin ataduras"
            title="Hecho para vender acá, y sin amarrarte"
            subtitle="Dos cosas que deberían darse por sentadas y casi nunca lo son: que la herramienta entienda cómo se cobra en el Perú, y que puedas irte con todo lo tuyo el día que quieras."
          />
        </Reveal>
        <RevealStagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <RevealItem key={it.title}>
                <SpotlightCard className="card h-full p-6 transition-colors hover:border-border-strong">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl ${it.tint}`}>
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.desc}</p>
                </SpotlightCard>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </Container>
    </section>
  );
}
