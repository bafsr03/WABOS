import { buildMetadata } from '@/lib/seo';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata = buildMetadata({
  title: 'Política de privacidad',
  description: 'Cómo WABOS recolecta, usa y protege la información de los negocios que usan la plataforma y de sus clientes.',
  path: '/legal/privacidad',
});

const UPDATED = '11 de agosto de 2026';

export default function PrivacidadPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Política de privacidad</h1>
      <p className="mt-2 text-sm text-subtle">Última actualización: {UPDATED}</p>

      {/* TODO(legal): reemplazar por la razón social, RUC y domicilio fiscal reales
          antes de publicar. Revisar con un abogado. */}
      <div className="mt-6 rounded-xl border border-warn/25 bg-warn/[0.06] p-4 text-sm text-muted">
        <strong className="text-fg">Pendiente de completar:</strong> falta la razón social, el RUC y el
        domicilio fiscal del responsable del tratamiento. Este documento debe ser revisado por un
        abogado antes de publicarse.
      </div>

      <h2>1. Quiénes somos</h2>
      <p>
        WABOS es una plataforma que permite a un negocio gestionar su atención, sus ventas y sus cobros
        a través de WhatsApp. El responsable del tratamiento de los datos es{' '}
        <strong>[RAZÓN SOCIAL]</strong>, con RUC <strong>[RUC]</strong> y domicilio en{' '}
        <strong>[DOMICILIO]</strong>, Perú.
      </p>

      <h2>2. Dos tipos de datos</h2>
      <p>Es importante distinguirlos, porque el rol de WABOS es distinto en cada caso:</p>
      <ul>
        <li>
          <strong>Datos del negocio que contrata WABOS.</strong> Nombre, correo, teléfono, datos de
          facturación y la información de uso de la plataforma. Aquí actuamos como responsables.
        </li>
        <li>
          <strong>Datos de los clientes finales del negocio.</strong> Los mensajes de WhatsApp,
          números de teléfono, comprobantes de pago y demás información que llega a través del chat.
          Aquí actuamos como <strong>encargados</strong>: esa información es del negocio, y la tratamos
          únicamente siguiendo sus instrucciones.
        </li>
      </ul>

      <h2>3. Qué información recolectamos</h2>
      <ul>
        <li>Datos de la cuenta: nombre, correo electrónico y contraseña (almacenada cifrada).</li>
        <li>Conversaciones de WhatsApp vinculadas a la cuenta, incluyendo texto e imágenes recibidas.</li>
        <li>Comprobantes de pago enviados por los clientes finales, y los datos extraídos de ellos.</li>
        <li>Catálogo, ventas, movimientos de caja y contactos cargados por el negocio.</li>
        <li>Datos técnicos básicos necesarios para operar el servicio.</li>
      </ul>

      <h2>4. Para qué la usamos</h2>
      <ul>
        <li>Prestar el servicio: mostrar el inbox, generar respuestas, registrar ventas y verificar pagos.</li>
        <li>Verificar comprobantes contrastándolos con las notificaciones bancarias del propio negocio.</li>
        <li>Enviar comunicaciones operativas (recuperación de contraseña, avisos del servicio).</li>
        <li>Facturar y gestionar la suscripción.</li>
        <li>Mejorar y mantener la seguridad de la plataforma.</li>
      </ul>
      <p>
        <strong>No vendemos datos personales</strong> ni los usamos para publicidad de terceros.
      </p>

      <h2>5. Proveedores que tratan datos por nosotros</h2>
      <p>
        Para prestar el servicio trabajamos con proveedores que pueden procesar información en nuestro
        nombre. Los relevantes son:
      </p>
      <ul>
        <li>
          <strong>Anthropic</strong> — provee los modelos de inteligencia artificial. Cuando la función
          de Empleado IA está activa, el contenido de las conversaciones necesarias para generar una
          respuesta, así como las imágenes de comprobantes que se verifican, se envían a sus servidores
          para ser procesados.
        </li>
        <li><strong>Cloudflare</strong> — almacenamiento de las imágenes de productos.</li>
        <li><strong>Proveedor de correo transaccional</strong> — envío de correos del sistema.</li>
        <li><strong>Proveedor de infraestructura</strong> — alojamiento de la aplicación y la base de datos.</li>
      </ul>
      <p>
        Si el negocio desactiva la función de inteligencia artificial, el contenido de las
        conversaciones no se envía a Anthropic.
      </p>

      <h2>6. Conservación</h2>
      <p>
        Conservamos la información mientras la cuenta esté activa. Al eliminar la cuenta, los datos
        asociados se eliminan de los sistemas activos, salvo aquello que debamos conservar por
        obligación legal o contable.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        De acuerdo con la Ley N.º 29733 de Protección de Datos Personales del Perú, puedes solicitar
        acceso, rectificación, cancelación u oposición respecto de tus datos personales escribiendo a{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. La plataforma también permite exportar
        la información del negocio en formato CSV en cualquier momento.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Las contraseñas se almacenan cifradas, el tráfico viaja sobre HTTPS y la información de cada
        negocio está aislada de la de los demás. Realizamos copias de seguridad periódicas. Ningún
        sistema es infalible, pero trabajamos para reducir el riesgo.
      </p>

      <h2>9. Sobre WhatsApp</h2>
      <p>
        WABOS no está afiliado a WhatsApp ni a Meta. La conexión se realiza vinculando un dispositivo,
        del mismo modo que WhatsApp Web. El uso de WhatsApp se rige además por sus propios términos.
      </p>

      <h2>10. Cambios</h2>
      <p>
        Si actualizamos esta política, cambiaremos la fecha del encabezado y, si el cambio es
        relevante, lo comunicaremos por correo.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para cualquier consulta sobre privacidad, escríbenos a{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </>
  );
}
