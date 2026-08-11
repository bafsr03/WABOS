/**
 * FAQ copy lives here so the visible <FAQ> accordion and the FAQPage JSON-LD
 * are generated from the same strings — they cannot drift apart.
 *
 * Every answer must be true of the shipped product. In particular: WABOS pairs
 * with WhatsApp Web (Baileys), it is NOT the official WhatsApp Business API;
 * receipt verification checks consistency against a real bank/Yape notification
 * and never auto-rejects; there are no groups and no outbound audio.
 */

export interface Faq { q: string; a: string }

export const HOME_FAQS: Faq[] = [
  {
    q: '¿Mis clientes tienen que instalar algo?',
    a: 'No. Te escriben a tu WhatsApp de siempre, como cualquier otro chat. WABOS trabaja de tu lado: tú ves todo desde el panel y tus clientes no notan ninguna diferencia.',
  },
  {
    q: '¿Cómo verifica WABOS que un pago es real?',
    a: 'Cuando el cliente manda la captura de Yape o Plin, la IA lee el monto, la fecha, el número de operación y a quién se le pagó. Además cruza esos datos con la notificación real que te llega del banco por correo. Si algo no calza —o si el número de operación ya se usó antes— no confirma: manda el caso a tu cola de revisión para que lo decidas tú.',
  },
  {
    q: '¿Se puede bloquear mi número?',
    a: 'WABOS se conecta como un dispositivo vinculado de WhatsApp, igual que WhatsApp Web. Para reducir el riesgo, los envíos masivos salen espaciados entre 6 y 12 segundos de forma aleatoria y nunca de golpe. Aun así, ningún proveedor puede garantizar que WhatsApp no tome medidas, así que te recomendamos empezar con volúmenes moderados.',
  },
  {
    q: '¿Funciona sin la IA?',
    a: 'Sí. Sin configurar la IA, WABOS sigue siendo tu inbox, tu CRM, tu catálogo, tu punto de venta, tu caja y tu analítica. La IA es una capa encima, y puedes activarla o desactivarla por conversación cuando quieras.',
  },
  {
    q: '¿Puedo tomar el control de un chat?',
    a: 'En cualquier momento. Cada conversación tiene un interruptor entre modo IA y modo humano. La IA también puede pasarte un chat sola cuando detecta que necesita una persona.',
  },
  {
    q: '¿Qué pasa con mis datos si me voy?',
    a: 'Son tuyos. Puedes exportar tus productos y tu información en CSV cuando quieras, y el sistema hace copias de seguridad automáticas. Tu número de WhatsApp sigue siendo tuyo: desvincularlo es un clic.',
  },
];

export const PRICING_FAQS: Faq[] = [
  {
    q: '¿Puedo probarlo sin pagar?',
    a: 'Sí. Al registrarte no se te pide tarjeta: entras a un espacio de trabajo gratuito con límites reducidos (100 contactos, 1 agente IA, 20 productos y 200 respuestas de IA al mes) para que lo pruebes con clientes reales. Cuando te quede chico, eliges un plan.',
  },
  {
    q: '¿Qué pasa si supero las respuestas de IA del mes?',
    a: 'La IA deja de responder automáticamente hasta el siguiente mes; tu inbox, tus cobros y todo lo demás siguen funcionando normal. Verás un aviso en el panel y puedes subir de plan para reactivarla al instante.',
  },
  {
    q: '¿Puedo cambiar de plan cuando quiera?',
    a: 'Sí, subes o bajas cuando quieras y el cobro se prorratea automáticamente. No hay permanencia ni penalidad por cancelar.',
  },
  {
    q: '¿Los precios incluyen IGV?',
    a: 'Sí. Todos los precios están en soles e incluyen IGV, sin cargos ocultos.',
  },
  {
    q: '¿Qué diferencia hay entre los planes?',
    a: 'Solo el volumen: cuántos contactos, productos, agentes IA y respuestas automáticas al mes. La única función exclusiva es el ADN de voz (que la IA aprenda a escribir como tú), disponible desde el plan Avanzado. Todo lo demás está incluido en todos los planes.',
  },
  {
    q: '¿Cómo funciona el pago anual?',
    a: 'Pagas 10 meses y usas 12, así que son 2 meses gratis. Se cobra una vez al año y puedes cancelar la renovación cuando quieras.',
  },
];
