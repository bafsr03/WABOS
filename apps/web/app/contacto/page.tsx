import { Mail, Clock, MessageSquare } from 'lucide-react';
import { buildMetadata, graph, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { SUPPORT_EMAIL } from '@/lib/site';
import { Container, SectionHeading, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ContactForm } from '@/components/forms/ContactForm';

export const metadata = buildMetadata({
  title: 'Contacto',
  description: `Escríbenos a ${SUPPORT_EMAIL} o déjanos un mensaje. Respondemos con una persona, normalmente el mismo día hábil.`,
  path: '/contacto',
});

const INFO = [
  { icon: Mail, title: 'Correo', desc: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { icon: Clock, title: 'Tiempo de respuesta', desc: 'Normalmente el mismo día hábil' },
  { icon: MessageSquare, title: '¿Quieres una demo?', desc: 'Cuéntanoslo en el mensaje y coordinamos una llamada' },
];

export default function ContactoPage() {
  return (
    <>
      {/* Organization (with its ContactPoint) is already emitted site-wide by
          the root layout — only the breadcrumb is page-specific here. */}
      <JsonLd data={graph(
        breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Contacto', path: '/contacto' }]),
      )} />

      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />

        <Container className="py-20 lg:py-24">
          <Reveal>
            <div className="text-center">
              <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Contacto</Pill>
              <SectionHeading
                as="h1"
                center
                className="mt-6"
                title="Hablemos de tu negocio"
                subtitle="Escríbenos con lo que necesitas y te responde una persona, no un formulario automático."
              />
            </div>
          </Reveal>

          <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-12">
            <Reveal>
              <div className="space-y-4">
                {INFO.map((i) => {
                  const Icon = i.icon;
                  const inner = (
                    <div className="card flex items-start gap-4 p-5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-fg">{i.title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{i.desc}</span>
                      </span>
                    </div>
                  );
                  return i.href
                    ? <a key={i.title} href={i.href} className="block transition-opacity hover:opacity-90">{inner}</a>
                    : <div key={i.title}>{inner}</div>;
                })}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <ContactForm />
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}
