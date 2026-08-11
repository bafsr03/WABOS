import {
  Inbox, Bot, Store, LineChart, Package, Users, Megaphone, BookOpen, Sun,
  Sparkles, Search, Tag, ArrowRightLeft, HandCoins, Bell,
} from 'lucide-react';
import { buildMetadata, graph, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, SectionHeading, Button, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ChatMock, HANDOFF_SCRIPT, DashboardMock, InboxMock, Panel } from '@/components/mocks';
import { FeatureSpotlight, FeatureRow, VerificationFlow, NotBuilt, CTASection } from '@/components/sections';
import { REGISTER_URL } from '@/lib/site';

export const metadata = buildMetadata({
  title: 'Producto',
  description: 'Inbox en tiempo real, Empleado IA con tu catálogo, verificación de comprobantes Yape y Plin, punto de venta, caja y analítica con ganancia real — todo sobre WhatsApp.',
  path: '/features',
});

const ANCHORS = [
  { href: '#inbox', label: 'Inbox' },
  { href: '#ia', label: 'Empleado IA' },
  { href: '#cobros', label: 'Cobros' },
  { href: '#pos', label: 'Punto de venta' },
  { href: '#analitica', label: 'Analítica' },
];

const SECONDARY = [
  { id: 'catalogo', icon: Package, title: 'Catálogo', desc: 'Productos con precio, costo, stock, categoría y foto. Importa y exporta en CSV, y la IA vende solo lo que existe y está disponible.' },
  { id: 'crm', icon: Users, title: 'CRM', desc: 'Cada contacto con sus etiquetas, sus notas y todo su historial. La IA también puede etiquetar sola a quien muestra interés.' },
  { id: 'campanas', icon: Megaphone, title: 'Campañas', desc: 'Difusiones a un segmento por etiqueta, con espaciado aleatorio de 6 a 12 segundos entre envíos para cuidar tu número.' },
  { id: 'conocimiento', icon: BookOpen, title: 'Base de conocimiento', desc: 'Tus preguntas frecuentes y tus documentos internos — políticas, garantías, zonas de reparto — para que la IA conteste con criterio.' },
  { id: 'cierre', icon: Sun, title: 'Cierre de día', desc: 'Un resumen de ventas, cobros y caja que te llega por WhatsApp o correo a la hora que elijas.' },
  { id: 'app', icon: Bell, title: 'App instalable', desc: 'Instálalo en tu teléfono como una app más y recibe notificaciones cuando llega un mensaje o un pago por revisar.' },
];

export default function FeaturesPage() {
  return (
    <>
      <JsonLd data={graph(breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Producto', path: '/features' },
      ]))} />

      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />
        <Container className="py-20 lg:py-24">
          <Reveal>
            <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> El producto</Pill>
            <SectionHeading
              as="h1"
              className="mt-6 max-w-3xl"
              title="Todo tu negocio, sobre WhatsApp"
              subtitle="Módulos que trabajan con los mismos datos: lo que se conversa en el chat termina en tu caja, tu stock y tus reportes sin que tú lo copies a mano."
            />
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap gap-2">
              {ANCHORS.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-fg"
                >
                  {a.label}
                </a>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      <FeatureSpotlight
        id="inbox"
        eyebrow="Inbox"
        title="Cada conversación, en tiempo real"
        desc="Un solo lugar para todo lo que entra por WhatsApp, con el historial completo de cada cliente a la vista."
        bullets={[
          'Los mensajes llegan en vivo, sin recargar ni refrescar nada',
          'Cambias entre modo IA y modo humano en cualquier chat, al instante',
          'Contadores de no leídos y notas internas por contacto',
          'Conversaciones de prueba para ensayar a tu agente sin gastar mensajes ni escribirle a un cliente real',
        ]}
        media={<InboxMock />}
      />

      <FeatureSpotlight
        id="ia"
        reverse
        eyebrow="Empleado IA"
        title="Un vendedor entrenado en tu negocio"
        desc="No es un bot de respuestas fijas. Consulta tu información real antes de contestar, y cuando no le corresponde, te pasa el chat."
        bullets={[
          'Busca en tu catálogo y oculta lo que está sin stock',
          'Consulta tu base de conocimiento para políticas y preguntas frecuentes',
          'Etiqueta al cliente y puede derivar a otro agente con otro rol',
          'Te pasa la conversación cuando detecta que necesita una persona',
          'ADN de voz: aprende cómo escribes tú y copia tu tono (desde el plan Avanzado)',
        ]}
        media={
          <Panel
            title="Empleado IA · Ventas"
            rows={[
              { icon: Search, primary: 'Busca en el catálogo', secondary: '“Inca Kola 3L — S/ 9.50, 12 en stock”', tag: 'Herramienta' },
              { icon: BookOpen, primary: 'Consulta tu base de conocimiento', secondary: '“Reparto en Surco hasta las 6pm”', tag: 'Herramienta' },
              { icon: Tag, primary: 'Etiqueta al cliente', secondary: 'interesado · mayorista', tag: 'Herramienta' },
              { icon: ArrowRightLeft, primary: 'Deriva a otro agente', secondary: 'Ventas → Soporte', tag: 'Herramienta' },
              { icon: HandCoins, primary: 'Genera el cobro', secondary: 'S/ 19.00 con tus datos de Yape', tag: 'Herramienta' },
              { icon: Sparkles, primary: 'ADN de voz', secondary: 'Aprende tu forma de escribir', tag: 'Avanzado' },
            ]}
          />
        }
      />

      <VerificationFlow />

      <FeatureSpotlight
        id="pos"
        eyebrow="Punto de venta y caja"
        title="La venta y la caja, sin cuaderno aparte"
        desc="Registra lo que vendes por el chat o en el mostrador, y lleva la cuenta del día sin pasar nada a mano."
        bullets={[
          'Registras la venta y el stock se descuenta solo, en la misma operación',
          'Guarda el costo del producto al momento de venderlo, así el margen es real y no un estimado',
          'Métodos de pago con su comisión, para saber cuánto te queda de verdad',
          'Caja del día con gastos e ingresos extra',
          'Anular una venta devuelve el stock automáticamente',
        ]}
        media={<DashboardMock />}
        reverse
      />

      <FeatureSpotlight
        id="analitica"
        eyebrow="Analítica"
        title="Cuánto ganaste, no cuánto facturaste"
        desc="La diferencia entre esos dos números es tu negocio. WABOS la calcula sola."
        bullets={[
          'Ganancia neta: ingresos menos costo, comisiones y gastos',
          'Ingresos por día, productos más vendidos y métodos de pago',
          'Lo que más te buscan tus clientes — para saber qué te falta tener',
          'Cuánto responde la IA y en cuánto tiempo lo hace',
        ]}
        media={
          <ChatMock
            script={HANDOFF_SCRIPT}
            title="Tech Store"
            subtitle="Modo humano"
            ariaLabel="Conversación de ejemplo donde el Empleado IA responde y luego deriva el chat a una persona."
          />
        }
      />

      <Container className="py-16 lg:py-20">
        <Reveal>
          <SectionHeading center eyebrow="Y además" title="El resto de lo que viene incluido" />
        </Reveal>
        <div className="mt-12">
          <FeatureRow items={SECONDARY} />
        </div>
        <div className="mt-12 flex justify-center">
          <Button href={REGISTER_URL} external size="xl">Probar WABOS</Button>
        </div>
      </Container>

      <NotBuilt />
      <CTASection />
    </>
  );
}
