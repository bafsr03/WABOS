'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Image as ImageIcon, ScanEye, Landmark, ShieldCheck, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';
import { ReviewQueueMock } from '../mocks/ReviewQueueMock';

const STEPS = [
  {
    icon: ImageIcon,
    title: 'Llega la captura',
    desc: 'Tu cliente manda el comprobante de Yape o Plin por WhatsApp, como siempre.',
  },
  {
    icon: ScanEye,
    title: 'La IA la lee',
    desc: 'Extrae monto, fecha, número de operación y a quién se le pagó — aunque la foto esté torcida o borrosa.',
  },
  {
    icon: Landmark,
    title: 'Se cruza con tu banco',
    desc: 'Compara esos datos con la notificación real que te llega por correo del banco o de Yape. Sin esa confirmación, no da nada por hecho.',
  },
];

const OUTCOMES = [
  {
    icon: ShieldCheck,
    tone: 'ok' as const,
    title: 'Todo calza → confirmado',
    desc: 'Se marca el cobro como pagado, se registra la venta y tu cliente recibe su confirmación automáticamente.',
  },
  {
    icon: UserCheck,
    tone: 'warn' as const,
    title: 'Algo no calza → lo decides tú',
    desc: 'Monto distinto, número de operación repetido, fecha fuera de rango o sin confirmación del banco: el caso pasa a tu cola de revisión con el motivo exacto. WABOS nunca rechaza un pago por su cuenta.',
  },
];

export function VerificationFlow({
  compact, id, queue, className,
}: {
  /** Suppress the built-in heading when the page supplies its own (/features). */
  compact?: boolean;
  /** Only the page that owns the #cobros anchor should set it. */
  id?: string;
  /** Show the real review queue beside the "algo no calza" fork (landing). */
  queue?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();
  const animate = !reduced && inView;

  return (
    <section id={id} className={cn('scroll-mt-24 py-20 lg:py-28', className)}>
      <Container>
        {!compact && (
          <Reveal>
            <SectionHeading
              center
              eyebrow="Cobros verificados"
              title="La captura ya no es la prueba. La confirmación de tu banco sí."
              subtitle="Es la diferencia entre creerle a una imagen y saber que el dinero entró. Así funciona, paso por paso."
            />
          </Reveal>
        )}

        <div ref={ref} className="mt-14">
          {/* Pipeline */}
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.title}
                  initial={reduced ? undefined : { opacity: 0, y: 16 }}
                  animate={animate ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="card relative p-6"
                >
                  <span className="tabular absolute right-5 top-5 text-xs font-semibold text-subtle">
                    0{i + 1}
                  </span>
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Fork. With `queue`, the two outcomes stack beside the real review
              queue so the "lo decides tú" claim is shown, not just asserted. */}
          <div className={cn('mt-4 grid gap-4', queue ? 'lg:grid-cols-2 lg:items-center' : 'md:grid-cols-2')}>
            <div className={cn('grid gap-4', queue ? 'sm:grid-cols-2 lg:grid-cols-1' : 'contents')}>
              {OUTCOMES.map((o, i) => {
                const Icon = o.icon;
                const ok = o.tone === 'ok';
                return (
                  <motion.div
                    key={o.title}
                    initial={reduced ? undefined : { opacity: 0, y: 16 }}
                    animate={animate ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.5, delay: 0.36 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className={`rounded-2xl border p-6 ${ok ? 'border-success/25 bg-success/[0.06]' : 'border-warn/25 bg-warn/[0.06]'}`}
                  >
                    <div className={`grid h-11 w-11 place-items-center rounded-xl ${ok ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'}`}>
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-fg">{o.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{o.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            {queue && (
              <motion.div
                initial={reduced ? undefined : { opacity: 0, y: 16 }}
                animate={animate ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-warn/[0.07] blur-3xl" />
                <ReviewQueueMock />
              </motion.div>
            )}
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
            Una verificación exitosa significa que el comprobante es consistente con el pago esperado y con la
            notificación de tu banco. No sustituye la conciliación de tu cuenta.
          </p>
        </div>
      </Container>
    </section>
  );
}
