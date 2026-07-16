import { initDb, setSetting, none } from './index.js';
import { pool } from './pool.js';

// Demo data profiled on a real business — STAND 120 (smokeshop, Surco, Lima).
// Lets you test the full flow (AI catalog answers, tags, broadcasts) against a
// realistic profile before loading your own data. Source: https://stand120.com
// Run with `pnpm --filter engine seed` (against the dev Postgres).

const products: [string, string, number][] = [
  ['Pack Hello Kitty', 'Pack temático Hello Kitty. Precio de oferta (regular S/ 119).', 90.0],
  ['Pack Mini Bong', 'Pack con mini bong, ideal para viaje. Precio de oferta (regular S/ 47).', 35.0],
  ['Pack Viajero', 'Pack compacto para llevar a todos lados. Precio de oferta (regular S/ 63.50).', 45.0],
  ['Pack Bulldogs King', 'Pack Bulldogs King. Precio de oferta (regular S/ 51).', 42.0],
  ['Pack Triple Filtro', 'Pack triple filtro. Precio de oferta (regular S/ 105).', 90.0],
  ['Pack Triple Celulosa', 'Pack de papeles de celulosa (x3). Precio de oferta (regular S/ 22).', 15.0],
  ['Grinder Gripped Verde Phoenix', 'Grinder Phoenix con grip, color verde. Precio de oferta (regular S/ 85).', 69.0],
  ['Tabaquera Soulblime Textil', 'Tabaquera textil marca Soulblime.', 35.0],
  ['Bong Beaker Mandala Phoenix Star Azul', 'Bong beaker Phoenix Star diseño mandala, color azul. Precio de oferta (regular S/ 135).', 119.0],
  ['Pipa 420 710 Silicona', 'Pipa de silicona resistente, diseño 420/710.', 35.0],
  ['Pipa Pen', 'Pipa tipo lapicero, discreta y portátil. Precio de oferta (regular S/ 35).', 30.0],
  ['Pipa Murano Lunares GRD', 'Pipa Murano con diseño de lunares, tamaño grande. Precio de oferta (regular S/ 65).', 49.0],
];

const faqs: [string, string][] = [
  ['¿Hacen delivery?', 'Sí. Delivery local en Lima por Indrive de lunes a sábado de 12:00 a 20:00. El costo del Indrive lo cubre el cliente según la zona.'],
  ['¿Hacen envíos a provincia?', 'Sí, enviamos a todo el Perú el mismo día por Olva Courier o Shalom, siempre que el pedido entre antes de las 5:00 pm (lunes a sábado). El costo depende de la ciudad.'],
  ['¿Dónde están ubicados?', 'Estamos en Av. Aviación 5024, interior 120, C.C. Polvos de Higuereta, Santiago de Surco, Lima. Puedes recoger tu pedido en tienda.'],
  ['¿Cuál es su horario?', 'Atendemos de lunes a sábado. El delivery local va de 12:00 a 20:00.'],
  ['¿Qué métodos de pago aceptan?', 'Aceptamos Yape, Plin, transferencia y efectivo contra entrega en Lima. Escríbenos para coordinar el pago.'],
  ['¿Tienen edad mínima?', 'Sí. Solo vendemos a personas mayores de 18 años.'],
  ['¿Puedo hacer devoluciones?', 'Contamos con política de devoluciones y reembolsos. Escríbenos con tu número de pedido y te ayudamos a coordinar.'],
  ['¿Dónde los sigo en redes?', 'Búscanos como @stand120_life en Instagram, TikTok y Facebook.'],
];

async function main() {
  await initDb();
  await setSetting('business_name', 'STAND 120');
  await setSetting(
    'business_description',
    'Smokeshop en Surco, Lima. Vendemos bongs, pipas, grinders, vaporizadores, papeles y accesorios para fumar. ' +
    'Tienda física en Av. Aviación 5024, int. 120, C.C. Polvos de Higuereta, Santiago de Surco. ' +
    'Delivery local por Indrive de lunes a sábado de 12:00 a 20:00. Envíos a todo el Perú el mismo día por Olva o Shalom ' +
    'para pedidos recibidos hasta las 5:00 pm (lunes a sábado). Redes: @stand120_life.',
  );
  await setSetting('business_hours', 'Lunes a sábado, delivery local 12:00–20:00. Envíos a provincia el mismo día si el pedido entra antes de las 5:00 pm.');
  await setSetting('ai_tone', 'Amigable, relajado y cercano, con buena onda. Responde en español peruano. Trata a los clientes como parte de la comunidad STAND 120.');
  await setSetting('ai_instructions',
    'Solo atendemos a mayores de 18 años; si detectas que es menor de edad, no continúes con la venta. ' +
    'Los productos son accesorios para fumar (tabaco/hierbas legales). No des consejos médicos ni promuevas sustancias ilegales. ' +
    'Si preguntan por disponibilidad exacta de stock o piden una foto de un producto, ofrece pasar la conversación a una persona.',
  );
  await setSetting('ai_enabled', '1');

  for (const [name, description, price] of products) {
    await none('INSERT INTO products (name, description, price) VALUES ($1, $2, $3)', [name, description, price]);
  }
  for (const [question, answer] of faqs) {
    await none('INSERT INTO faqs (question, answer) VALUES ($1, $2)', [question, answer]);
  }

  console.log(`Seeded: ${products.length} products, ${faqs.length} FAQs, business profile for "STAND 120".`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
