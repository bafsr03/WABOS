import type { Metadata } from 'next';
import {
  MessageCircle, Bot, ShieldCheck, Megaphone, Users, ShoppingBag,
  Hash, StickyNote, Clock, Tag, type LucideIcon,
} from 'lucide-react';
import { Container, Pill, Button } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { ChatMock, DashboardMock } from '@/components/mocks';
import { FeatureSpotlight, CTASection } from '@/components/sections';
import { LOGIN_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Producto',
  description: 'Inbox en tiempo real, Empleado IA, cobros verificados, campañas, CRM y catálogo — todo sobre WhatsApp.',
};

/* Small visual panel for modules without a dedicated mock. */
function Panel({ title, rows }: { title: string; rows: { icon: LucideIcon; primary: string; secondary?: string; tag?: string }[] }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]">
      <div className="border-b border-border px-5 py-3 text-sm font-semibold text-fg">{title}</div>
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.primary} className="flex items-center gap-3 px-5 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={17} /></span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{r.primary}</div>
                {r.secondary && <div className="truncate text-xs text-muted">{r.secondary}</div>}
              </div>
              {r.tag && <span className="ml-auto rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-muted">{r.tag}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OVERVIEW: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: MessageCircle, label: 'Inbox', href: '#inbox' },
  { icon: Bot, label: 'Empleado IA', href: '#ia' },
  { icon: ShieldCheck, label: 'Cobros', href: '#cobros' },
  { icon: Megaphone, label: 'Campañas', href: '#campanas' },
  { icon: Users, label: 'CRM', href: '#crm' },
  { icon: ShoppingBag, label: 'Catálogo', href: '#catalogo' },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 hero-glow" />
        <div className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
        <Container className="pb-6 pt-16 text-center lg:pt-24">
          <Reveal>
            <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> El producto</Pill>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Todo tu negocio, sobre WhatsApp
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
              Seis módulos que trabajan juntos para que atiendas, vendas y cobres sin salir del chat.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
              {OVERVIEW.map((o) => {
                const Icon = o.icon;
                return (
                  <a key={o.label} href={o.href} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-fg">
                    <Icon size={15} className="text-brand" /> {o.label}
                  </a>
                );
              })}
            </div>
          </Reveal>
        </Container>
      </section>

      <FeatureSpotlight
        id="inbox"
        eyebrow="Inbox"
        title="Cada conversación, en tiempo real"
        desc="Un buzón único con todas tus conversaciones de WhatsApp, sincronizado al instante. Historial completo, estados de lectura y respuesta desde cualquier dispositivo."
        bullets={[
          'Sincronización en vivo vía WebSocket — sin refrescar.',
          'Marca conversaciones, ve sin leer y prioriza.',
          'Cambia entre modo IA y modo humano por chat.',
        ]}
        media={<ChatMock />}
      />

      <FeatureSpotlight
        id="ia"
        reverse
        eyebrow="Empleado IA"
        title="Un vendedor con IA, entrenado en tu negocio"
        desc="Responde con tu perfil de negocio, tus FAQs y tu catálogo, con el tono de tu marca. Recomienda productos, cotiza y cierra ventas 24/7."
        bullets={[
          'Usa tu contexto: perfil, FAQs y catálogo.',
          'Distintos «empleados»: ventas, soporte, recepción.',
          'Tú intervienes cuando quieras, sin fricción.',
        ]}
        media={<Panel title="Empleado IA · Ventas" rows={[
          { icon: Bot, primary: 'Recomienda Inca Kola 3L', secondary: '«Perfecto para compartir 🥤»', tag: 'IA' },
          { icon: ShoppingBag, primary: 'Consulta el catálogo', secondary: '48 productos · precios al día' },
          { icon: MessageCircle, primary: 'Responde en 2 seg', secondary: 'Tono de tu marca', tag: '24/7' },
        ]} />}
      />

      <FeatureSpotlight
        id="cobros"
        eyebrow="Cobros verificados"
        title="Confirma pagos con certeza, no con capturas"
        desc="Genera cobros, recibe comprobantes y deja que WABOS los verifique contra la notificación real de tu banco antes de dar por pagado."
        bullets={[
          'Lectura del comprobante con IA (visión).',
          'Cruce con el pago real: número de operación + monto.',
          'Cola de revisión para los casos dudosos.',
        ]}
        media={<DashboardMock />}
      />

      <FeatureSpotlight
        id="campanas"
        reverse
        eyebrow="Campañas"
        title="Difusiones que no arriesgan tu número"
        desc="Envía campañas segmentadas por etiquetas, con espaciado anti-bloqueo y límites por plan que protegen tu cuenta de WhatsApp."
        bullets={[
          'Segmenta por etiquetas y grupos de contactos.',
          'Espaciado automático de 6–12 s por mensaje.',
          'Seguimiento de entrega y respuestas.',
        ]}
        media={<Panel title="Campaña · Clientes frecuentes" rows={[
          { icon: Megaphone, primary: 'Promo fin de semana', secondary: '340 contactos · etiqueta «frecuente»', tag: 'Enviando' },
          { icon: Clock, primary: 'Espaciado anti-bloqueo', secondary: '8 s entre mensajes' },
          { icon: Tag, primary: 'Segmentado por etiqueta', secondary: 'frecuente, mayorista' },
        ]} />}
      />

      <FeatureSpotlight
        id="crm"
        eyebrow="CRM"
        title="Conoce a cada cliente sin salir del chat"
        desc="Contactos con etiquetas, notas e historial. Todo el contexto que necesitas para atender mejor y vender más."
        bullets={[
          'Etiquetas y segmentos para organizar tu cartera.',
          'Notas internas por contacto.',
          'Historial de conversaciones y compras.',
        ]}
        media={<Panel title="Contacto · Ana Torres" rows={[
          { icon: Tag, primary: 'Etiquetas', secondary: 'frecuente · mayorista', tag: '3' },
          { icon: StickyNote, primary: 'Nota', secondary: 'Prefiere entregas los martes' },
          { icon: Hash, primary: '12 pedidos', secondary: 'Último: S/ 19.00' },
        ]} />}
      />

      <FeatureSpotlight
        id="catalogo"
        reverse
        eyebrow="Catálogo"
        title="Tus productos, listos para vender"
        desc="Carga tu catálogo con precios y deja que el Empleado IA lo use para responder y recomendar al instante."
        bullets={[
          'Productos con precio y descripción.',
          'La IA cotiza y recomienda desde el catálogo.',
          'Actualiza precios y disponibilidad en segundos.',
        ]}
        media={<Panel title="Catálogo" rows={[
          { icon: ShoppingBag, primary: 'Inca Kola 3L', secondary: 'Gaseosa', tag: 'S/ 9.50' },
          { icon: ShoppingBag, primary: 'Arroz Costeño 5kg', secondary: 'Abarrotes', tag: 'S/ 24.90' },
          { icon: ShoppingBag, primary: 'Aceite Primor 1L', secondary: 'Abarrotes', tag: 'S/ 8.40' },
        ]} />}
      />

      <Container className="pb-4">
        <div className="flex justify-center">
          <Button href={LOGIN_URL} external size="lg">Probar WABOS gratis</Button>
        </div>
      </Container>

      <CTASection />
    </>
  );
}
