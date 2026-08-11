import {
  Store, Package, Users, Megaphone, BookOpen, Sun,
  Sparkles, Search, Tag, ArrowRightLeft, HandCoins, Bell,
  AlertTriangle, Percent, Wallet, TrendingUp,
} from 'lucide-react';
import { buildMetadata, graph, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, SectionHeading, Button, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { DashboardMock, InboxMock, Panel } from '@/components/mocks';
import { FeatureSpotlight, FeatureRow, DividedList, NotBuilt, CTASection } from '@/components/sections';
import { REGISTER_URL } from '@/lib/site';

export const metadata = buildMetadata({
  title: 'Producto',
  description: 'Inbox en tiempo real, Empleado IA con tu catálogo, verificación de comprobantes Yape y Plin, punto de venta, caja y analítica con ganancia real — todo sobre WhatsApp.',
  path: '/features',
});

// Includes the secondary modules because Footer.tsx deep-links #catalogo,
// #crm and #campanas — they need visible peers here.
const ANCHORS = [
  { href: '#inbox', label: 'Inbox' },
  { href: '#ia', label: 'Empleado IA' },
  { href: '#cobros', label: 'Cobros' },
  { href: '#pos', label: 'Punto de venta' },
  { href: '#analitica', label: 'Analítica' },
  { href: '#catalogo', label: 'Catálogo' },
  { href: '#crm', label: 'CRM' },
  { href: '#campanas', label: 'Campañas' },
];

// Mirrors the checks in apps/engine/src/modules/verification.ts. These are the
// actual reasons a receipt lands in the review queue — /features enumerates
// them, the landing page only tells the story.
const REVIEW_REASONS = [
  { title: 'El monto no coincide', desc: 'Lo que dice el comprobante no calza con el cobro que generaste, fuera de la tolerancia configurada.' },
  { title: 'El número de operación ya se usó', desc: 'Ese mismo código apareció en otro comprobante antes. Es la forma más común de reciclar una captura vieja.' },
  { title: 'La fecha está fuera de rango', desc: 'El comprobante es de hace días, o de una fecha que no corresponde al cobro.' },
  { title: 'No llegó la confirmación del banco', desc: 'La captura se ve bien, pero todavía no aparece la notificación real de tu banco o de Yape que la respalde.' },
  { title: 'El destinatario no eres tú', desc: 'El nombre o el número al que se pagó no coincide con los datos de cobro que configuraste.' },
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
        title="Cómo funciona el inbox"
        desc="Un hilo por cliente, con todo su historial, sus etiquetas y sus notas al costado."
        bullets={[
          'Los mensajes entran por websocket: aparecen sin recargar ni refrescar',
          'Un interruptor IA / humano por conversación, con efecto inmediato',
          'Contador de no leídos, notas internas y etiquetas por contacto',
          'Conversaciones de prueba para ensayar a un agente sin gastar mensajes del plan ni escribirle a un cliente real',
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

      {/* The landing page owns the verification STORY — the 3-step diagram and
          the confirmed/review fork live there, and are deliberately not
          repeated. This page owns the RULES: the exact conditions that send a
          receipt to the review queue. */}
      <section id="cobros" className="scroll-mt-24 border-y border-border bg-bg-tint py-20 lg:py-24">
        <Container>
          <Reveal>
            <SectionHeading
              center
              eyebrow="Cobros verificados"
              title="Qué manda un comprobante a revisión"
              subtitle="La verificación es una lista de condiciones, no una corazonada. Si alguna no se cumple, el caso llega a tu cola con el motivo exacto en vez de aprobarse solo."
            />
          </Reveal>
          <Reveal delay={0.1}>
            <DividedList items={REVIEW_REASONS} icon={AlertTriangle} tone="warn" className="mx-auto mt-12 max-w-3xl" />
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-subtle">
              Ningún comprobante se rechaza automáticamente: lo que no calza queda esperando tu decisión.
              Una verificación exitosa significa que el comprobante es consistente con el cobro y con la
              notificación de tu banco — no sustituye la conciliación de tu cuenta.
            </p>
          </Reveal>
        </Container>
      </section>

      <FeatureSpotlight
        id="pos"
        eyebrow="Punto de venta y caja"
        title="Qué registra cada venta"
        desc="Vendas por el chat o en el mostrador, la venta entra una sola vez y arrastra todo lo demás con ella."
        bullets={[
          'El stock se descuenta en la misma operación que registra la venta',
          'Guarda el costo del producto en el momento de venderlo, así el margen no cambia si mañana subes el precio',
          'Cada método de pago lleva su comisión configurable, y se descuenta del neto',
          'Anular una venta devuelve el stock',
          'La caja del día suma ventas, gastos e ingresos extra',
        ]}
        media={
          <Panel
            title="Caja · hoy"
            rows={[
              { icon: Store, primary: 'Ventas', secondary: '12 operaciones', tag: 'S/ 842' },
              { icon: Percent, primary: 'Comisiones', secondary: 'Tarjeta 0.35%', tag: '− S/ 23' },
              { icon: Wallet, primary: 'Gastos del día', secondary: 'Movilidad, envases', tag: '− S/ 95' },
              { icon: TrendingUp, primary: 'Efectivo en caja', secondary: 'Después de todo', tag: 'S/ 410' },
            ]}
          />
        }
      />

      <FeatureSpotlight
        id="analitica"
        reverse
        eyebrow="Analítica"
        title="Qué números calcula"
        desc="Todo se deriva de las ventas ya registradas, así que no hay nada que llenar aparte."
        bullets={[
          'Ganancia neta: ingresos − costo de lo vendido − comisiones − gastos',
          'Ingresos por día, productos más vendidos y reparto por método de pago',
          'Lo que más te buscan y no encontraron, para saber qué te falta tener',
          'Cuántas respuestas dio la IA y su tiempo mediano de respuesta',
        ]}
        media={<DashboardMock />}
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
      <CTASection
        title="La lista completa está bien, pero verlo funcionando es mejor"
        subtitle="Conéctalo a tu número y mira cómo responde a tus clientes de verdad. Sin tarjeta."
      />
    </>
  );
}
