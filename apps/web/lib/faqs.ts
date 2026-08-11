/**
 * FAQ copy lives here so the visible <FAQ> accordion and the FAQPage JSON-LD are
 * generated from the same strings — they cannot drift apart.
 *
 * Two rules:
 *
 * 1. An FAQ earns its slot only if the answer ISN'T already on the page above
 *    it. These lists were previously six-for-six restatements of sections the
 *    visitor had just scrolled past. If you add one, check the page first.
 * 2. Every answer must be true of the shipped product. WABOS pairs with
 *    WhatsApp Web (Baileys), it is NOT the official WhatsApp Business API;
 *    receipt verification checks consistency and never auto-rejects; there are
 *    no groups and no outbound audio.
 */

export interface Faq { q: string; a: string }

export const HOME_FAQS: Faq[] = [
  {
    q: '¿Tengo que cambiar de número o crear una cuenta de WhatsApp Business?',
    a: 'No. WABOS se vincula al número que ya usas, tal como está. Da igual si tienes WhatsApp normal o WhatsApp Business: se conecta como un dispositivo más, igual que cuando abres WhatsApp Web en la computadora. Tus clientes te siguen escribiendo al mismo número de siempre y no notan nada distinto.',
  },
  {
    q: 'Ya tengo a alguien contestando el WhatsApp. ¿Lo reemplaza?',
    a: 'Trabajan juntos. La IA se encarga de lo repetitivo — precios, stock, horarios, cobros — y tu persona se queda con lo que de verdad necesita criterio. En cualquier chat pueden tomar el control con un interruptor, y la propia IA les pasa la conversación cuando se le sale del libreto. La mayoría lo usa para que su gente deje de contestar lo mismo cien veces y se dedique a cerrar ventas.',
  },
  {
    q: '¿Qué pasa si se me apaga el celular o me quedo sin internet?',
    a: 'WABOS corre en nuestros servidores, no en tu teléfono, así que sigue atendiendo aunque tu celular esté apagado o sin señal. Si se corta la conexión, se reconecta solo. Lo único a tener en cuenta es que WhatsApp cierra las sesiones vinculadas cuando el teléfono principal pasa muchos días sin conectarse; si eso ocurre, vuelves a escanear el QR y listo.',
  },
  {
    q: '¿Se puede bloquear mi número?',
    a: 'Es el riesgo real de cualquier herramienta que se conecte a WhatsApp, y preferimos decirlo. Para reducirlo, los envíos masivos salen espaciados de forma aleatoria y nunca de golpe. Aun así, ningún proveedor puede garantizarte que WhatsApp no tome medidas, así que la recomendación es empezar con volúmenes moderados y escribirle sobre todo a gente que ya te conoce.',
  },
  {
    q: '¿Funciona si no quiero usar la IA?',
    a: 'Sí, y mucha gente empieza así. Sin activar la IA, WABOS te sirve igual como inbox, CRM, catálogo, punto de venta, caja y reportes — y la verificación de pagos sigue funcionando. La IA es una capa encima que puedes prender, apagar, o dejar activa solo en algunas conversaciones.',
  },
];

export const PRICING_FAQS: Faq[] = [
  {
    q: '¿Puedo cambiar de plan cuando quiera?',
    a: 'Sí, subes o bajas cuando quieras y el cobro se prorratea automáticamente: solo pagas la diferencia por los días que faltan. No hay permanencia ni penalidad por cancelar.',
  },
  {
    q: '¿Cómo funciona el pago anual?',
    a: 'Pagas 10 meses y usas 12 — esos son los 2 meses gratis. Se cobra una sola vez al año y puedes desactivar la renovación cuando quieras; el plan te dura hasta el final del periodo que ya pagaste.',
  },
  {
    q: 'El precio, ¿es por número de WhatsApp o por negocio?',
    a: 'Por negocio. Cada plan cubre un negocio con su catálogo, sus contactos y su equipo. Los planes Básico y Avanzado incluyen un número de WhatsApp conectado; Pro incluye dos, útil si manejas dos locales o quieres separar ventas de soporte.',
  },
  {
    q: '¿Qué pasa con mi información si dejo de pagar?',
    a: 'No se borra nada. Tu cuenta vuelve al espacio gratuito y conservas tus conversaciones, tus contactos y tu catálogo; lo que cambia son los límites. Puedes exportar tus datos en CSV en cualquier momento, pagues o no.',
  },
];
