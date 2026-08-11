import { Moon, ShieldAlert, Calculator, Repeat, PhoneOff, LayoutGrid } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal, RevealStagger, RevealItem } from '../Reveal';

const PAINS = [
  { icon: Moon, title: 'Respondes a las 11 de la noche', desc: 'Y si no respondes, el cliente le compra al de al lado. El horario de tu negocio lo termina poniendo WhatsApp.' },
  { icon: ShieldAlert, title: 'Te mandan capturas falsas', desc: 'Una imagen editada, un pago que nunca llegó, y te enteras al día siguiente cuando revisas el banco.' },
  { icon: Calculator, title: 'No sabes cuánto ganas de verdad', desc: 'Sabes cuánto vendiste. Cuánto te quedó después del costo, las comisiones y los gastos es otra historia.' },
  { icon: Repeat, title: 'Contestas lo mismo 50 veces al día', desc: '¿Tienen tal cosa? ¿A cuánto? ¿Hacen delivery? Las mismas cinco preguntas, todos los días.' },
  { icon: PhoneOff, title: 'Persigues a los que no pagaron', desc: 'Escribir “hola, recordatorio del pago” es incómodo, y por eso muchas veces simplemente no lo haces.' },
  { icon: LayoutGrid, title: 'Saltas entre cuatro apps', desc: 'WhatsApp para vender, el cuaderno para anotar, Excel para el stock y la calculadora para la caja.' },
];

export function PainGrid() {
  return (
    <section className="relative border-y border-border bg-bg-tint py-20 lg:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            center
            eyebrow="Te suena familiar"
            title="Vender por WhatsApp funciona. Sostenerlo, no tanto."
            subtitle="Ninguno de estos problemas es tuyo por hacer las cosas mal. Son de trabajar con herramientas que nunca se diseñaron para vender."
          />
        </Reveal>
        <RevealStagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAINS.map((p) => {
            const Icon = p.icon;
            return (
              <RevealItem key={p.title}>
                <div className="h-full rounded-2xl border border-border/60 bg-surface/40 p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-danger/10 text-danger">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.desc}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </Container>
    </section>
  );
}
