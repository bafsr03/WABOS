import type { Metadata } from 'next';
import { Target, Heart, Zap, ShieldCheck, Mail, MessageCircle, ArrowRight } from 'lucide-react';
import { Container, Pill, Button, SectionHeading } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { Stats } from '@/components/sections';

export const metadata: Metadata = {
  title: 'Nosotros',
  description: 'La historia de WABOS y cómo ayudamos a los negocios a vender mejor por WhatsApp. Contáctanos o solicita una demo.',
};

const VALUES = [
  { icon: Zap, title: 'Simple, no simplista', desc: 'La tecnología poderosa debería sentirse fácil. Si tu abuela puede usar WhatsApp, puede usar WABOS.' },
  { icon: ShieldCheck, title: 'Confianza primero', desc: 'Nunca confirmamos un pago que no llegó. Protegemos tu número y tu dinero por defecto.' },
  { icon: Heart, title: 'Hecho para PYMEs', desc: 'Construido para el minimarket, la boutique y el delivery — no para corporaciones con equipos de IT.' },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 hero-glow" />
        <Container className="pb-8 pt-16 text-center lg:pt-24">
          <Reveal>
            <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Nosotros</Pill>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Le devolvemos el tiempo a los negocios que viven en WhatsApp
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
              Millones de negocios venden por WhatsApp, pero lo hacen a pulso: respondiendo a mano, persiguiendo pagos
              y perdiendo ventas de madrugada. WABOS nació para cambiar eso.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* Mission */}
      <Container className="py-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white"><Target size={20} /></span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Nuestra misión</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Que cualquier negocio, sin importar su tamaño, pueda atender como una gran empresa: al instante,
                a toda hora y sin errores. Convertimos WhatsApp — la app que ya usan — en un sistema operativo
                completo para vender, atender y cobrar.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand"><Heart size={20} /></span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Por qué existimos</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Vimos a dueños de minimarkets responder mensajes a las 11 de la noche y aceptar capturas de Yape
                falsas por confiar. Creímos que la IA y una buena verificación de pagos podían resolver ambos
                problemas — sin pedirle a nadie que cambie de app.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>

      <Stats items={[
        { value: '1,200+', label: 'Negocios activos' },
        { value: '5', label: 'Empleados IA' },
        { value: '6–12 s', label: 'Espaciado anti-bloqueo' },
        { value: '24/7', label: 'Atención automática' },
      ]} />

      {/* Values */}
      <Container className="py-16 lg:py-20">
        <Reveal><SectionHeading center eyebrow="Valores" title="Lo que nos guía" /></Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {VALUES.map((v, i) => {
            const Icon = v.icon;
            return (
              <Reveal key={v.title} delay={i * 0.06}>
                <div className="h-full rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand"><Icon size={20} /></span>
                  <h3 className="mt-4 text-base font-semibold text-fg">{v.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{v.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>

      {/* Contact + demo */}
      <Container className="py-12">
        <div id="contacto" className="grid scroll-mt-24 gap-8 lg:grid-cols-2 lg:gap-12">
          <Reveal>
            <SectionHeading eyebrow="Contacto" title="Hablemos" subtitle="¿Preguntas, prensa o alianzas? Escríbenos y te respondemos pronto." />
            <div className="mt-6 space-y-3">
              <a href="mailto:hola@wabos.app" className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm shadow-[var(--shadow-card)] transition-colors hover:border-border-strong">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand"><Mail size={17} /></span>
                <div><div className="font-medium text-fg">hola@wabos.app</div><div className="text-muted">Correo general</div></div>
              </a>
              <a href="https://wa.me/51987654321" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm shadow-[var(--shadow-card)] transition-colors hover:border-border-strong">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-wa/10 text-[#0f9d63]"><MessageCircle size={17} /></span>
                <div><div className="font-medium text-fg">WhatsApp</div><div className="text-muted">Escríbenos por chat, cómo no</div></div>
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <form
              id="demo"
              action="mailto:hola@wabos.app"
              method="post"
              encType="text/plain"
              className="scroll-mt-24 rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8"
            >
              <h3 className="text-lg font-semibold text-fg">Solicita una demo</h3>
              <p className="mt-1 text-sm text-muted">Déjanos tus datos y te mostramos WABOS con tu caso.</p>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-fg">Nombre</span>
                  <input name="nombre" required className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" placeholder="Tu nombre" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-fg">Correo o WhatsApp</span>
                  <input name="contacto" required className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" placeholder="tucorreo@ejemplo.com" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-fg">Cuéntanos de tu negocio</span>
                  <textarea name="mensaje" rows={3} className="w-full resize-y rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" placeholder="Tipo de negocio, volumen de mensajes…" />
                </label>
                <Button size="lg" className="w-full">Enviar solicitud <ArrowRight size={16} /></Button>
                <p className="text-center text-xs text-subtle">Al enviar aceptas que te contactemos sobre WABOS.</p>
              </div>
            </form>
          </Reveal>
        </div>
      </Container>
    </>
  );
}
