import { Minus } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';
import { DividedList } from './DividedList';

/**
 * Honesty section, exclusive to /features. Counter-intuitively one of the
 * strongest conversion elements for a skeptical SMB buyer — and a permanent
 * guard against the overclaiming this site used to do.
 *
 * This section owns the "dispositivo vinculado / no es la API oficial" claim;
 * it should not be restated elsewhere.
 */
const LIMITS = [
  { title: 'No trabaja en grupos', desc: 'WABOS atiende conversaciones uno a uno. Los mensajes de grupos se ignoran a propósito.' },
  { title: 'No manda audios ni imágenes', desc: 'La IA responde con texto. Tú sí puedes mandar lo que quieras desde tu WhatsApp de siempre.' },
  { title: 'No transcribe notas de voz', desc: 'Si tu cliente manda un audio, lo verás en el chat, pero la IA no lo interpreta todavía.' },
  { title: 'No es la API oficial de WhatsApp', desc: 'Se conecta como dispositivo vinculado, igual que WhatsApp Web. Por eso cuidamos tanto el ritmo de los envíos.' },
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
          <DividedList items={LIMITS} icon={Minus} className="mx-auto mt-12 max-w-3xl" />
        </Reveal>
      </Container>
    </section>
  );
}
