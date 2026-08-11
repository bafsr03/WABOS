// The first-run product tour script. Each step (except the centered welcome/finish
// ones) points at a `data-tour` value present on BOTH the desktop sidebar link and
// the mobile bottom-bar pill for that destination — the visible one wins at runtime.
export interface TourStep {
  id: string;
  target?: string; // data-tour value; omit for a centered card
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenido a WABOS 👋',
    body: 'Tu negocio, dentro de WhatsApp. Te muestro lo esencial en 30 segundos.',
  },
  {
    id: 'connect',
    target: 'connect',
    title: 'Conecta tu WhatsApp',
    body: 'Escanea un QR y listo. Todo empieza aquí: mensajes, cobros y tu asistente.',
    placement: 'right',
  },
  {
    id: 'catalog',
    target: 'catalog',
    title: 'Arma tu catálogo',
    body: 'Agrega productos con precio y costo — calculamos tu ganancia automáticamente.',
    placement: 'right',
  },
  {
    id: 'sales',
    target: 'sales',
    title: 'Punto de venta',
    body: 'Registra cada venta al toque: efectivo, Yape, Plin o tarjeta. Sin cuentas a mano.',
    placement: 'right',
  },
  {
    id: 'cashflow',
    target: 'cashflow',
    title: 'Caja y reportes',
    body: 'Abre la caja con el efectivo del día, registra ingresos y gastos, y ciérrala contando lo que hay. Tu cierre llega por WhatsApp.',
    placement: 'right',
  },
  {
    id: 'inbox',
    target: 'inbox',
    title: 'Inbox con IA',
    body: 'Tu asistente responde y cobra por ti en WhatsApp. Tú solo supervisas.',
    placement: 'right',
  },
];
