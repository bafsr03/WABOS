import { Minus } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';

/**
 * Honesty section. Counter-intuitively one of the strongest conversion elements
 * for a skeptical SMB buyer — and a permanent guard against the overclaiming
 * this site used to do.
 */
const LIMITS = [
  { title: 'No trabaja en grupos', desc: 'WABOS atiende conversaciones uno a uno. Los mensajes de grupos se ignoran a propósito.' },
  { title: 'No manda audios ni imágenes', desc: 'La IA responde con texto. Tú sí puedes mandar lo que quieras desde tu WhatsApp de siempre.' },
  { title: 'No transcribe notas de voz', desc: 'Si tu cliente manda un audio, lo verás en el chat, pero la IA no lo interpreta todavía.' },
  { title: 'No es la API oficial de WhatsApp', desc: 'Se conecta como dispositivo vinculado, igual que WhatsApp Web. Por eso cuidamos tanto el espaciado de los envíos.' },
];

export function NotBuilt() {
  return (
    <section className="border-y border-border bg-bg-tint py-20 lg:py-24">
      <Container>
        <Reveal>
          <SectionHeading
            center
            eyebrow="Con todas sus letras"
            title="Lo que WABOS todavía no hace"
            subtitle="Preferimos que lo sepas ahora y no después de pagar. Esto es lo que hoy queda fuera."
          />
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {LIMITS.map((l) => (
              <div key={l.title} className="flex items-start gap-4 px-6 py-5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-subtle">
                  <Minus size={13} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-fg">{l.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{l.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
