/**
 * Single source of truth for what we advertise.
 *
 * Every number here mirrors apps/engine/src/modules/entitlements.ts (LIMITS,
 * ~line 26) and MUST be changed in lockstep with it. The old pricing page kept
 * a hand-maintained parallel array that drifted into advertising features the
 * product never had (seats, appointments, pipelines, retention tiers) — hence
 * one shared array here, consumed by the cards, the comparison table AND the
 * Offer JSON-LD, so the visible price and the structured data cannot diverge.
 *
 * The engine also defines a `free` tier (100 contactos / 1 agente / 20
 * productos / 200 mensajes IA). New signups land on it and it has no expiry,
 * but it is deliberately NOT sold as a plan here — it's the no-card starting
 * point, explained in the pricing FAQ instead of shown as a card.
 */

export interface Plan {
  id: 'basico' | 'avanzado' | 'pro' | 'enterprise';
  name: string;
  /** Monthly price in PEN. */
  monthly: number;
  /** Show "Desde" before the price (enterprise is quoted, not fixed). */
  from?: boolean;
  blurb: string;
  popular?: boolean;
  cta: string;
  /** null = ilimitado */
  contacts: number | null;
  agents: number | null;
  products: number | null;
  aiMessages: number | null;
  numbers: number | null;
  /** The ONE genuinely gated feature — GATED_FEATURES = ['style_analysis']. */
  styleAnalysis: boolean;
  /** Extras that are true but not a numeric limit. */
  extras: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'basico',
    name: 'Básico',
    monthly: 49,
    blurb: 'Para dejar de responder todo a mano.',
    cta: 'Empezar',
    contacts: 1000, agents: 1, products: 200, aiMessages: 1000, numbers: 1,
    styleAnalysis: false,
    extras: ['Inbox en tiempo real', 'Cobros verificados', 'Punto de venta y caja'],
  },
  {
    id: 'avanzado',
    name: 'Avanzado',
    monthly: 89,
    popular: true,
    blurb: 'Para negocios que ya venden por WhatsApp.',
    cta: 'Empezar',
    contacts: 5000, agents: 3, products: 1000, aiMessages: 3000, numbers: 1,
    styleAnalysis: true,
    // Extras must not restate a limit row above them, or the card reads twice.
    extras: ['Todo lo de Básico', 'ADN de voz: la IA aprende cómo escribes'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 159,
    blurb: 'Para operaciones con volumen real.',
    cta: 'Empezar',
    contacts: 20000, agents: 5, products: 5000, aiMessages: 6000, numbers: 2,
    styleAnalysis: true,
    // No "soporte prioritario" here: there is no support-tier logic in the
    // product, and it isn't a commitment we can assert on the customer's behalf.
    extras: ['Todo lo de Avanzado', 'Un segundo número, para otra sucursal o para separar ventas y soporte'],
  },
  {
    id: 'enterprise',
    name: 'Empresarial',
    monthly: 399,
    from: true,
    blurb: 'Varias sucursales o requisitos a medida.',
    cta: 'Hablemos',
    contacts: null, agents: null, products: null, aiMessages: null, numbers: null,
    styleAnalysis: true,
    extras: ['Todo sin límites', 'Infraestructura dedicada', 'Acuerdo de nivel de servicio'],
  },
];

/** Annual billing bills 10 months — shown as the monthly equivalent. */
export const ANNUAL_MONTHS_CHARGED = 10;
export const annualMonthly = (monthly: number) => Math.round((monthly * ANNUAL_MONTHS_CHARGED) / 12);
export const annualTotal = (monthly: number) => monthly * ANNUAL_MONTHS_CHARGED;

const num = (v: number | null) => (v === null ? 'Ilimitado' : v.toLocaleString('es-PE'));

/**
 * Comparison rows derived from PLANS — never hand-maintained.
 * Volume rows first, then the single gated feature, then everything that is
 * included in every plan (which is the actual story: we gate scale, not features).
 */
export const COMPARE_LIMITS: { label: string; get: (p: Plan) => string }[] = [
  { label: 'Contactos (CRM)', get: (p) => num(p.contacts) },
  { label: 'Agentes IA', get: (p) => num(p.agents) },
  { label: 'Productos en catálogo', get: (p) => num(p.products) },
  { label: 'Respuestas IA / mes', get: (p) => num(p.aiMessages) },
  { label: 'Números de WhatsApp', get: (p) => num(p.numbers) },
];

export const COMPARE_GATED: { label: string; get: (p: Plan) => boolean }[] = [
  { label: 'ADN de voz (la IA aprende tu estilo)', get: (p) => p.styleAnalysis },
];

/** True on every tier. Listed explicitly so nobody wonders what's missing. */
export const INCLUDED_EVERYWHERE = [
  'Inbox de WhatsApp en tiempo real',
  'Empleado IA con tu catálogo y tus FAQs',
  'Verificación de comprobantes Yape / Plin',
  'Recordatorios de cobro automáticos',
  'Punto de venta y caja',
  'Analítica con ganancia neta real',
  'Catálogo con importación CSV',
  'Campañas con espaciado anti-bloqueo',
  'Base de conocimiento',
  'Cierre de día por WhatsApp',
  'Copias de seguridad automáticas',
  'App instalable (PWA) con notificaciones',
];
