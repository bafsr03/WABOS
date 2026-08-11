import { buildMetadata } from '@/lib/seo';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata = buildMetadata({
  title: 'Términos y condiciones',
  description: 'Condiciones de uso del servicio WABOS: planes, límites, pagos, responsabilidades y cancelación.',
  path: '/legal/terminos',
});

const UPDATED = '11 de agosto de 2026';

export default function TerminosPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-subtle">Última actualización: {UPDATED}</p>

      {/* TODO(legal): completar razón social / RUC / domicilio y revisar con abogado. */}
      <div className="mt-6 rounded-xl border border-warn/25 bg-warn/[0.06] p-4 text-sm text-muted">
        <strong className="text-fg">Pendiente de completar:</strong> falta la razón social, el RUC y el
        domicilio fiscal. Este documento debe ser revisado por un abogado antes de publicarse.
      </div>

      <h2>1. Aceptación</h2>
      <p>
        Al crear una cuenta o usar WABOS aceptas estos términos. El servicio es prestado por{' '}
        <strong>[RAZÓN SOCIAL]</strong>, RUC <strong>[RUC]</strong>, con domicilio en{' '}
        <strong>[DOMICILIO]</strong>, Perú.
      </p>

      <h2>2. Qué es el servicio</h2>
      <p>
        WABOS es una herramienta de software que se conecta a tu cuenta de WhatsApp para ayudarte a
        atender clientes, gestionar tu catálogo, registrar ventas y verificar comprobantes de pago.
        WABOS no es una entidad financiera, no procesa pagos ni custodia dinero.
      </p>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Debes proporcionar información veraz y mantener tu contraseña segura.</li>
        <li>Eres responsable de la actividad que ocurra en tu cuenta.</li>
        <li>Debes ser mayor de edad y tener facultad para contratar en nombre del negocio.</li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>No puedes usar WABOS para:</p>
      <ul>
        <li>Enviar mensajes no solicitados a personas que no aceptaron recibirlos.</li>
        <li>Actividades ilegales, fraudulentas o que infrinjan derechos de terceros.</li>
        <li>Vulnerar, sobrecargar o intentar acceder sin autorización a la plataforma.</li>
      </ul>
      <p>
        El envío masivo de mensajes es responsabilidad tuya y debe respetar las políticas de WhatsApp
        y la normativa peruana aplicable.
      </p>

      <h2>5. Sobre WhatsApp y el riesgo de bloqueo</h2>
      <p>
        WABOS se conecta vinculando un dispositivo, igual que WhatsApp Web, y <strong>no es la API
        oficial de WhatsApp Business</strong>. No estamos afiliados a WhatsApp ni a Meta. Aunque
        aplicamos medidas para reducir el riesgo (como espaciar los envíos masivos de forma aleatoria),
        <strong> no podemos garantizar que WhatsApp no restrinja o bloquee tu número</strong>, y no
        somos responsables si eso ocurre.
      </p>

      <h2>6. Verificación de pagos</h2>
      <p>
        La función de verificación comprueba que un comprobante sea <strong>consistente</strong> con el
        cobro esperado y con la notificación que recibe el negocio de su banco. Es una herramienta de
        apoyo: <strong>no constituye confirmación de que el dinero se acreditó</strong> ni sustituye la
        conciliación de tu cuenta bancaria. La decisión final sobre aceptar un pago es siempre tuya.
      </p>

      <h2>7. Inteligencia artificial</h2>
      <p>
        Las respuestas generadas automáticamente pueden contener errores. Puedes desactivar la IA o
        tomar el control de cualquier conversación en cualquier momento. Eres responsable de lo que se
        comunica a tus clientes desde tu número.
      </p>

      <h2>8. Planes, límites y pagos</h2>
      <ul>
        <li>Los precios están en soles e incluyen IGV, y se muestran en la página de precios.</li>
        <li>Cada plan tiene límites de contactos, productos, agentes y respuestas de IA al mes.</li>
        <li>Al alcanzar el límite mensual de respuestas de IA, esta deja de responder de forma automática hasta el siguiente periodo; el resto del servicio continúa funcionando.</li>
        <li>La suscripción se renueva automáticamente hasta que la canceles.</li>
        <li>Los cambios de plan se prorratean.</li>
      </ul>

      <h2>9. Cancelación</h2>
      <p>
        Puedes cancelar cuando quieras y mantendrás el acceso hasta el final del periodo pagado. No
        hay permanencia mínima. Podemos suspender cuentas que incumplan estos términos.
      </p>

      <h2>10. Tus datos y tu contenido</h2>
      <p>
        Tu información y la de tus clientes te pertenecen. Puedes exportarla en CSV en cualquier
        momento. El tratamiento de datos personales se rige por nuestra{' '}
        <a href="/legal/privacidad">política de privacidad</a>.
      </p>

      <h2>11. Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para mantener el servicio disponible, pero puede haber interrupciones por
        mantenimiento o causas fuera de nuestro control (incluidos cambios de WhatsApp). En la medida
        permitida por la ley, nuestra responsabilidad total se limita al monto que hayas pagado por el
        servicio en los últimos tres meses.
      </p>

      <h2>12. Cambios en los términos</h2>
      <p>
        Podemos actualizar estos términos. Si el cambio es relevante te avisaremos por correo con
        antelación razonable.
      </p>

      <h2>13. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de la República del Perú, y cualquier controversia se
        someterá a los jueces y tribunales de Lima.
      </p>

      <h2>14. Contacto</h2>
      <p>
        Para consultas sobre estos términos, escríbenos a{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </>
  );
}
