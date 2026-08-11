import Link from 'next/link';
import { Target, Heart, Sparkles, ShieldCheck, Users, Cpu, Database, Lock } from 'lucide-react';
import { buildMetadata, graph, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, SectionHeading, Button, Pill } from '@/components/ui';
import { Reveal, RevealStagger, RevealItem } from '@/components/Reveal';
import { ProofBand, CTASection } from '@/components/sections';

export const metadata = buildMetadata({
  title: 'Nosotros',
  description: 'Por qué existe WABOS y cómo ayudamos a los negocios peruanos a vender mejor por WhatsApp sin perder el control de su tiempo ni de su dinero.',
  path: '/about',
});

const VALUES = [
  { icon: Sparkles, title: 'Simple, no simplista', desc: 'Un dueño de negocio no debería necesitar capacitación para cobrar. Si algo requiere manual, está mal diseñado.' },
  { icon: ShieldCheck, title: 'La confianza primero', desc: 'Cuando hay dinero de por medio, preferimos preguntarte antes que asumir. Por eso nada se rechaza solo.' },
  { icon: Users, title: 'Para PYMEs de verdad', desc: 'No para empresas con área de sistemas. Para el minimarket, la boutique y el que reparte a domicilio.' },
];

const HOW = [
  { icon: Cpu, title: 'IA de Anthropic (Claude)', desc: 'La misma familia de modelos que usan empresas grandes, puesta a trabajar en tu catálogo y tu forma de escribir.' },
  { icon: Database, title: 'Postgres y copias diarias', desc: 'Tus datos en una base seria, con respaldos automáticos y exportación en CSV cuando quieras.' },
  { icon: Lock, title: 'Cada negocio, aislado', desc: 'La información de tu negocio está separada de la de cualquier otro. Nadie ve tus conversaciones ni tus números.' },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={graph(breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Nosotros', path: '/about' },
      ]))} />

      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />
        <Container className="py-20 lg:py-24">
          <Reveal>
            <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Nosotros</Pill>
            <SectionHeading
              as="h1"
              className="mt-6 max-w-3xl"
              title="Le devolvemos el tiempo a los negocios que viven en WhatsApp"
              subtitle="Miles de negocios en el Perú venden por WhatsApp todos los días: responden a mano, persiguen pagos y pierden ventas de madrugada. No porque hagan las cosas mal, sino porque nadie construyó una herramienta para eso."
            />
          </Reveal>
        </Container>
      </section>

      <Container className="pb-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl bg-brand p-8 text-white">
              <Target size={24} />
              <h2 className="mt-5 text-xl font-semibold">Nuestra misión</h2>
              <p className="mt-3 leading-relaxed text-white/80">
                Que un negocio pequeño pueda atender como uno grande sin contratar a nadie más y sin
                cambiar la forma en que ya trabaja. Tu WhatsApp sigue siendo tu WhatsApp: lo que cambia
                es todo lo que ocurre detrás.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-border bg-brand/[0.07] p-8">
              <Heart size={24} className="text-brand-glow" />
              <h2 className="mt-5 text-xl font-semibold text-fg">Por qué existimos</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Empezó viendo a dueños de minimarket contestando mensajes a las once de la noche y
                aceptando capturas de Yape que después resultaban falsas. Ese problema no se arregla con
                otra app más: se arregla dentro del chat donde ya están.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>

      <ProofBand />

      <Container className="py-16 lg:py-20">
        <Reveal>
          <SectionHeading center eyebrow="Lo que nos guía" title="Cómo tomamos decisiones" />
        </Reveal>
        <RevealStagger className="mt-12 grid gap-4 md:grid-cols-3">
          {VALUES.map((v) => {
            const Icon = v.icon;
            return (
              <RevealItem key={v.title}>
                <div className="card h-full p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{v.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{v.desc}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </Container>

      <section className="border-y border-border bg-bg-tint py-16 lg:py-20">
        <Container>
          <Reveal>
            <SectionHeading center eyebrow="Cómo está construido" title="Sin misterio detrás" />
          </Reveal>
          <RevealStagger className="mt-12 grid gap-4 md:grid-cols-3">
            {HOW.map((h) => {
              const Icon = h.icon;
              return (
                <RevealItem key={h.title}>
                  <div className="card h-full p-6">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                      <Icon size={18} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-fg">{h.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{h.desc}</p>
                  </div>
                </RevealItem>
              );
            })}
          </RevealStagger>

          <Reveal delay={0.15}>
            <div className="mt-10 text-center">
              <p className="text-muted">¿Tienes una pregunta o quieres una demo?</p>
              <div className="mt-5">
                <Button href="/contacto" size="lg">Escríbenos</Button>
              </div>
              <p className="mt-4 text-sm text-subtle">
                También puedes leer nuestra{' '}
                <Link href="/legal/privacidad" className="text-brand-glow hover:underline">política de privacidad</Link>.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <CTASection />
    </>
  );
}
