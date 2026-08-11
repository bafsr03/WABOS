import { ArrowRight, QrCode, PackageSearch, MessageSquareText, Sparkles } from 'lucide-react';
import { REGISTER_URL } from '@/lib/site';
import { HOME_FAQS } from '@/lib/faqs';
import { graph, softwareApplicationSchema, faqSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, Button, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ChatMock, SALES_SCRIPT, HANDOFF_SCRIPT, DashboardMock, InboxMock, Panel } from '@/components/mocks';
import {
  FeatureSpotlight, FAQ, CTASection, ProblemList, VerificationFlow,
  StickyShowcase, ProofPanel, TrustBand, PricingTeaser,
} from '@/components/sections';

/**
 * The landing page tells the STORY. /features carries the specs.
 *
 * Two rules this file exists to enforce, and which are easy to break by adding
 * "just one more section":
 *
 * 1. No two adjacent sections share a shape or a background. In order the
 *    fingerprints run: asymmetric hero → divided list → two-column spotlight →
 *    numbered pipeline + queue → sticky rail → solid brand panel → icon grid →
 *    price strip + accordion → centered band. Backgrounds alternate
 *    bg / tint / bg / tint / bg / brand / bg / tint / bg.
 * 2. Each module is described in exactly one place. Inbox, IA and analítica get
 *    one angle each inside the sticky tour; POS, catálogo, CRM, campañas,
 *    conocimiento and cierre de día live only on /features.
 */

const SHOWCASE = [
  {
    key: 'inbox',
    label: 'Inbox',
    title: 'Tú decides quién contesta',
    desc: 'Cada conversación tiene un interruptor entre la IA y tú. Lo mueves cuando quieras, en medio del chat, y el cliente nunca nota el cambio.',
    media: <InboxMock />,
  },
  {
    key: 'ia',
    label: 'Empleado IA',
    title: 'No inventa, y sabe cuándo llamarte',
    desc: 'Responde con lo que hay en tu catálogo y en tus respuestas guardadas — nada más. Cuando la conversación se sale de ahí, te la pasa en vez de improvisar.',
    media: (
      <ChatMock
        script={HANDOFF_SCRIPT}
        title="Boutique Lima"
        ariaLabel="Conversación donde el Empleado IA responde sobre delivery y luego pasa el chat a una persona."
      />
    ),
  },
  {
    key: 'analitica',
    label: 'Números',
    title: 'Cuánto ganaste, no cuánto vendiste',
    desc: 'Le descuenta a cada venta lo que te costó el producto, la comisión del método de pago y los gastos del día. Lo que queda es plata de verdad.',
    media: <DashboardMock />,
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={graph(softwareApplicationSchema(), faqSchema(HOME_FAQS))} />

      {/* 1 · Hero — asymmetric two-column, the only section with aurora */}
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
                  WABOS contesta a tus clientes, te lleva el inventario y revisa cada pago antes de
                  darlo por bueno. Todo dentro del WhatsApp que ya usas.
                </p>
              </Reveal>

              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={REGISTER_URL} external size="xl">
                    Empezar ahora <ArrowRight size={16} />
                  </Button>
                  <Button href="/features" size="xl" variant="secondary">Ver el producto</Button>
                </div>
              </Reveal>

              {/* The canonical home for these three claims — they appear nowhere
                  else on the page. */}
              <Reveal delay={0.2}>
                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle">
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Sin tarjeta</li>
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Sin apps para tus clientes</li>
                  <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-wa" /> Listo en una tarde</li>
                </ul>
              </Reveal>
            </div>

            <Reveal delay={0.15} blur>
              <ChatMock script={SALES_SCRIPT} />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* 2 · The problem — divided list on a tint band */}
      <ProblemList />

      {/* 3 · Setup — two-column spotlight, the format's first use on this page */}
      <FeatureSpotlight
        eyebrow="Puesta en marcha"
        title="Una tarde, y queda andando"
        desc="No hay migración, ni capacitación, ni un número nuevo que repartir. Sigues con el mismo WhatsApp de siempre."
        bullets={[
          'Escaneas un QR desde WhatsApp → Dispositivos vinculados, igual que WhatsApp Web',
          'Subes tu lista de productos, o la importas de una hoja de cálculo',
          'Escribes las respuestas que ya das cien veces al día',
          'Desde ahí, la IA contesta con eso y con nada más',
        ]}
        media={
          <Panel
            title="Puesta en marcha"
            rows={[
              { icon: QrCode, primary: 'Número vinculado', secondary: 'El mismo que ya usas con tus clientes', tag: 'Listo' },
              { icon: PackageSearch, primary: 'Catálogo cargado', secondary: '48 productos con precio y stock', tag: 'Listo' },
              { icon: MessageSquareText, primary: 'Respuestas guardadas', secondary: 'Horarios, delivery, garantías', tag: 'Listo' },
              { icon: Sparkles, primary: 'Empleado IA activo', secondary: 'Contestando desde ahora', tag: 'Activo' },
            ]}
          />
        }
      />

      {/* 4 · The moat — numbered pipeline + the real review queue, tint band.
          This page owns the #cobros anchor and the narrative; /features owns
          the enumerated reason codes. */}
      <div className="border-y border-border bg-bg-tint">
        <VerificationFlow id="cobros" queue />
      </div>

      {/* 5 · Sticky product tour — one angle per module, no feature lists */}
      <StickyShowcase
        eyebrow="Por dentro"
        heading="Así se ve trabajando"
        subtitle="Tres partes que comparten los mismos datos: lo que pasa en el chat aparece solo en tu caja, tu stock y tus reportes."
        items={SHOWCASE}
      />

      {/* 6 · The page's only saturated surface */}
      <ProofPanel />

      {/* 7 · The only icon-card grid left, so the format reads as deliberate */}
      <TrustBand />

      {/* 8 · Price strip + centered accordion, on a tint band */}
      <section className="border-y border-border bg-bg-tint">
        <PricingTeaser />
        <Container className="pb-20 pt-16 lg:pb-24">
          <FAQ items={HOME_FAQS} center title="Lo que casi siempre nos preguntan" />
        </Container>
      </section>

      <CTASection />
    </>
  );
}
