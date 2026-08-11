import { ArrowRight, Inbox, Bot, BadgeCheck, Store, LineChart, Megaphone } from 'lucide-react';
import { REGISTER_URL } from '@/lib/site';
import { HOME_FAQS } from '@/lib/faqs';
import { graph, softwareApplicationSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, Button, Pill, SectionHeading } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ChatMock, SALES_SCRIPT, HANDOFF_SCRIPT, DashboardMock, InboxMock, ReviewQueueMock } from '@/components/mocks';
import {
  FeatureGrid, HowItWorks, FAQ, CTASection, PainGrid, VerificationFlow,
  StickyShowcase, ProofBand, PeruBand, OwnershipBand, PricingTeaser, type Feature,
} from '@/components/sections';

const FEATURES: Feature[] = [
  { icon: Inbox, title: 'Inbox en tiempo real', desc: 'Todas tus conversaciones en un solo lugar, con historial, notas y respuesta al instante desde cualquier dispositivo.', href: '/features#inbox' },
  { icon: Bot, title: 'Empleado IA', desc: 'Responde con tu catálogo, tus precios y tus FAQs — nunca con información inventada. Le pasas el chat cuando quieras.', href: '/features#ia' },
  { icon: BadgeCheck, title: 'Cobros verificados', desc: 'Lee el comprobante de Yape o Plin y lo cruza con la notificación real de tu banco antes de darlo por pagado.', href: '/features#cobros' },
  { icon: Store, title: 'Punto de venta y caja', desc: 'Registra ventas, descuenta stock y lleva la caja del día. Con el costo de cada producto, para saber lo que de verdad ganaste.', href: '/features#pos' },
  { icon: LineChart, title: 'Analítica real', desc: 'Ingresos, costos, comisiones y gastos. La ganancia neta, no solo cuánto facturaste.', href: '/features#analitica' },
  { icon: Megaphone, title: 'Campañas seguras', desc: 'Difusiones segmentadas por etiqueta, con espaciado aleatorio de 6 a 12 segundos para cuidar tu número.', href: '/features#campanas' },
];

const SHOWCASE = [
  {
    key: 'inbox',
    label: 'Inbox',
    title: 'Cada conversación, en vivo',
    desc: 'Ves los mensajes llegar en tiempo real y decides chat por chat si responde la IA o respondes tú. El cambio es instantáneo, sin avisarle a nadie.',
    media: <InboxMock />,
  },
  {
    key: 'ia',
    label: 'Empleado IA',
    title: 'Un vendedor que conoce tu catálogo',
    desc: 'Busca en tus productos, consulta tu base de conocimiento, etiqueta al cliente y te pasa el chat cuando hace falta una persona. Si no está en tu catálogo, no se lo inventa.',
    media: <ChatMock script={HANDOFF_SCRIPT} title="Boutique Lima" ariaLabel="Conversación donde el Empleado IA responde sobre delivery y luego pasa el chat a una persona." />,
  },
  {
    key: 'cobros',
    label: 'Cobros',
    title: 'Lo dudoso lo decides tú',
    desc: 'Cuando el comprobante no cuadra con el cobro o con tu banco, el caso llega a tu cola de revisión con el motivo exacto. Nada se rechaza solo.',
    media: <ReviewQueueMock />,
  },
  {
    key: 'analitica',
    label: 'Analítica',
    title: 'Cuánto ganaste, no cuánto vendiste',
    desc: 'Descuenta el costo de lo que vendiste, las comisiones de cada método de pago y tus gastos del día. El número que queda es el que importa.',
    media: <DashboardMock />,
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={graph(softwareApplicationSchema(), faqSchema(HOME_FAQS))} />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-10"><i /></div>
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />

        <Container className="py-20 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Reveal>
                <Pill>
                  <span className="h-1.5 w-1.5 rounded-full bg-wa" /> Tu negocio, dentro de WhatsApp
                </Pill>
              </Reveal>

              <Reveal delay={0.05}>
                <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-6xl">
                  Convierte tu WhatsApp en tu{' '}
                  <span className="text-gradient">empleado más inteligente</span>
                </h1>
              </Reveal>

              <Reveal delay={0.1}>
                <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
                  WABOS responde a tus clientes, controla tu inventario y verifica cada pago antes de
                  darlo por bueno. Todo dentro del WhatsApp que ya usas.
                </p>
              </Reveal>

              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={REGISTER_URL} external size="xl">
                    Empezar ahora <ArrowRight size={16} />
                  </Button>
                  <Button href="/features" size="xl" variant="secondary">Ver cómo funciona</Button>
                </div>
              </Reveal>

              <Reveal delay={0.2}>
                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle">
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Sin tarjeta</li>
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Sin apps para tus clientes</li>
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Tus datos son tuyos</li>
                </ul>
              </Reveal>
            </div>

            <Reveal delay={0.15} blur>
              <ChatMock script={SALES_SCRIPT} />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ---------------- Funnel ---------------- */}
      <PainGrid />

      <Container className="py-20 lg:py-28">
        <Reveal>
          <SectionHeading
            center
            eyebrow="Todo en uno"
            title="Una sola plataforma para vender, atender y cobrar"
            subtitle="Deja de saltar entre el chat, el cuaderno y la hoja de cálculo. WABOS junta todo lo que tu negocio necesita, sobre WhatsApp."
          />
        </Reveal>
        <div className="mt-14">
          <FeatureGrid features={FEATURES} />
        </div>
      </Container>

      <VerificationFlow />

      <StickyShowcase
        eyebrow="Por dentro"
        heading="Así se ve trabajar con WABOS"
        subtitle="Cuatro módulos que comparten los mismos datos: lo que pasa en el chat se refleja en tu caja, tu stock y tus reportes."
        items={SHOWCASE}
      />

      <ProofBand />
      <HowItWorks />
      <PeruBand />
      <OwnershipBand />
      <PricingTeaser />
      <FAQ items={HOME_FAQS} />
      <CTASection />
    </>
  );
}
