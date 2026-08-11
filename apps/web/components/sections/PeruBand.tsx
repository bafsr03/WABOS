import { Wallet, Receipt, Languages, Clock } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal, RevealStagger, RevealItem } from '../Reveal';

const ITEMS = [
  { icon: Wallet, title: 'Yape, Plin y transferencias', desc: 'Los medios con los que realmente te pagan, entendidos de fábrica — no un “otros métodos” genérico.' },
  { icon: Receipt, title: 'Soles e IGV', desc: 'Precios, márgenes y reportes en S/, con el impuesto donde corresponde.' },
  { icon: Languages, title: 'Español, no traducido', desc: 'La IA responde como se habla acá, y aprende cómo escribes tú.' },
  { icon: Clock, title: 'Hora de Lima', desc: 'El cierre de día, los recordatorios y los reportes cuadran con tu jornada, no con otro huso horario.' },
];

export function PeruBand() {
  return (
    <section className="border-y border-border bg-bg-tint py-20 lg:py-24">
      <Container>
        <Reveal>
          <SectionHeading
            center
            eyebrow="Hecho en Perú"
            title="Pensado para cómo se vende acá"
            subtitle="No es un producto de afuera con el idioma cambiado. Está construido alrededor de la forma en que los negocios peruanos cobran y atienden."
          />
        </Reveal>
        <RevealStagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <RevealItem key={it.title}>
                <div className="card h-full p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-wa/10 text-wa">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.desc}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </Container>
    </section>
  );
}
