import { ArrowRight, MessageCircle, Bot, ShieldCheck, Megaphone, Users, ShoppingBag, Star } from 'lucide-react';
import { LOGIN_URL } from '@/lib/site';
import { Container, Button, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ChatMock, DashboardMock } from '@/components/mocks';
import {
  LogoCloud, FeatureGrid, HowItWorks, FeatureSpotlight, Stats, FAQ, CTASection, type Feature,
} from '@/components/sections';

const FEATURES: Feature[] = [
  { icon: MessageCircle, title: 'Inbox en tiempo real', desc: 'Todas tus conversaciones de WhatsApp en un solo lugar, con historial, notas y respuesta instantánea.', href: '/features#inbox' },
  { icon: Bot, title: 'Empleado IA', desc: 'Un vendedor con IA que responde por ti usando tu catálogo, tus FAQs y el tono de tu marca. 24/7.', href: '/features#ia' },
  { icon: ShieldCheck, title: 'Cobros verificados', desc: 'Recibe comprobantes y verifica el pago contra tu banco antes de confirmar. Detecta capturas falsas.', href: '/features#cobros' },
  { icon: Megaphone, title: 'Campañas segmentadas', desc: 'Envía difusiones por etiquetas, con límites anti-bloqueo para proteger tu número.', href: '/features#campanas' },
  { icon: Users, title: 'CRM integrado', desc: 'Contactos con etiquetas, notas y segmentos. Conoce a cada cliente sin salir del chat.', href: '/features#crm' },
  { icon: ShoppingBag, title: 'Catálogo', desc: 'Tus productos y precios listos para que la IA venda y responda al instante.', href: '/features#catalogo' },
];

const FAQS = [
  { q: '¿Necesito instalar algo para mis clientes?', a: 'No. Tus clientes te escriben por WhatsApp como siempre. WABOS trabaja detrás de tu número usando la vinculación de dispositivos.' },
  { q: '¿Cómo verifica los pagos?', a: 'WABOS lee el comprobante con IA y lo cruza con la notificación real de tu banco (número de operación + monto). Solo confirma cuando el dinero realmente llegó.' },
  { q: '¿Es seguro para mi número de WhatsApp?', a: 'Incluimos guardas anti-bloqueo: envíos con pausas y límites estrictos en campañas. Aun así, recomendamos usarlo de forma responsable.' },
  { q: '¿Funciona sin la IA?', a: 'Sí. Todo funciona en modo manual; la IA es opcional y puedes activarla o desactivarla por conversación.' },
  { q: '¿En qué países funciona?', a: 'En cualquier país. La verificación de pagos está optimizada para Yape y transferencias bancarias, y es extensible a otros medios.' },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 hero-glow" />
        <div className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
        <Container className="pb-8 pt-16 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Reveal>
                <Pill>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Tu negocio, dentro de WhatsApp
                </Pill>
              </Reveal>
              <Reveal delay={0.05}>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-6xl">
                  Convierte tu WhatsApp en tu <span className="text-gradient">empleado más inteligente</span>
                </h1>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted">
                  WABOS responde a tus clientes, gestiona tu inventario y verifica cada pago —
                  todo automático, sin que tengas que salir del chat.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href={LOGIN_URL} external size="lg">Empezar gratis <ArrowRight size={16} /></Button>
                  <Button href="/features" size="lg" variant="secondary">Ver cómo funciona</Button>
                </div>
              </Reveal>
              <Reveal delay={0.2}>
                <div className="mt-8 flex items-center gap-4 text-sm text-muted">
                  <div className="flex -space-x-2">
                    {['A', 'M', 'J', 'R'].map((l) => (
                      <span key={l} className="grid h-8 w-8 place-items-center rounded-full border-2 border-bg bg-surface-3 text-xs font-semibold text-muted">{l}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex text-brand">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill="currentColor" />)}</div>
                    <span className="ml-1">+1,200 negocios activos</span>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.15} className="flex justify-center lg:justify-end">
              <ChatMock />
            </Reveal>
          </div>
        </Container>
      </section>

      <LogoCloud />

      {/* Feature grid */}
      <Container className="py-20 lg:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-brand">Todo en uno</span>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Una sola plataforma para vender, atender y cobrar
            </h2>
            <p className="mt-4 text-lg text-muted">Deja de saltar entre apps. WABOS reúne todo lo que tu negocio necesita sobre WhatsApp.</p>
          </div>
        </Reveal>
        <div className="mt-14"><FeatureGrid features={FEATURES} /></div>
      </Container>

      <HowItWorks />

      {/* Spotlights */}
      <FeatureSpotlight
        id="ia"
        eyebrow="Empleado IA"
        title="Un vendedor que nunca duerme"
        desc="El Empleado IA de WABOS conversa con tus clientes como lo harías tú: recomienda productos, responde precios y cierra ventas — con el tono de tu marca."
        bullets={[
          'Aprende de tu perfil de negocio, tus FAQs y tu catálogo.',
          'Responde en segundos, a cualquier hora del día.',
          'Tú tomas el control de cualquier chat cuando quieras.',
        ]}
        media={<ChatMock />}
      />
      <FeatureSpotlight
        id="cobros"
        reverse
        eyebrow="Cobros verificados"
        title="Nunca más te estafan con una captura falsa"
        desc="WABOS lee el comprobante y lo cruza con la notificación real de tu banco antes de confirmar. Si algo no cuadra, va a revisión."
        bullets={[
          'Verificación contra el pago real (número de operación + monto).',
          'Detecta y envía a revisión los comprobantes sospechosos.',
          'Cola de revisión para que tú tengas la última palabra.',
        ]}
        media={<DashboardMock />}
      />

      <Stats items={[
        { value: '1,200+', label: 'Negocios activos' },
        { value: '30 seg', label: 'Para conectar' },
        { value: '24/7', label: 'Atención con IA' },
        { value: '0', label: 'Apps para tus clientes' },
      ]} />

      <CTASection />
 
      <FAQ items={FAQS} />     
    </>
  );
}
