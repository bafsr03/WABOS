import { Container } from '../ui';
import { Reveal } from '../Reveal';
import { Counter } from '../motion/Counter';

/**
 * Replaces the old ProofBand. Two jobs:
 *
 * 1. Proof without customer counts — every figure is a property of the software,
 *    verified against apps/engine: 6 tools in ai/tools.ts, a 20-message window
 *    in ai/employee.ts:137, and AI_DEBOUNCE_MS = 4000 in wa/inbound.ts:14.
 * 2. The landing page's only saturated surface — it sits between the sticky
 *    product tour and the trust grid to break a long run of dark cards.
 *
 * Exclusive to the landing page (/about deliberately does not render it).
 * The "6–12 s" broadcast figure belongs to /features#campanas, not here.
 */
const ITEMS: { value: React.ReactNode; label: string }[] = [
  { value: <Counter value={6} />, label: 'cosas que puede hacer sola: buscar en tu catálogo, etiquetar, cobrar, pasarte el chat' },
  { value: <Counter value={20} />, label: 'mensajes de la conversación que lee antes de contestar' },
  { value: <Counter value={4} suffix=" s" />, label: 'que espera por si sigues escribiendo, para no cortarte a media idea' },
  { value: <>24/7</>, label: 'sin feriados, sin hora de almuerzo, sin “te respondo mañana”' },
];

export function ProofPanel() {
  return (
    <Container className="py-16 lg:py-20">
      <Reveal blur>
        <div className="noise relative overflow-hidden rounded-3xl bg-brand p-8 lg:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'radial-gradient(80% 120% at 15% 0%, rgba(255,255,255,0.20), transparent 60%)' }}
          />
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-wider text-white/70">
              El Empleado IA, en números
            </p>
            <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {ITEMS.map((s, i) => (
                <div key={i}>
                  <div className="tabular text-4xl font-semibold tracking-tight text-white lg:text-5xl">{s.value}</div>
                  <div className="mt-2 text-sm leading-snug text-white/70">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </Container>
  );
}
