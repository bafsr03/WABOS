import { one, many, getAllSettings } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { getSalesSettings, getDaySummary, dayExpr } from './sales.js';
import { getCashPosition } from './ledger.js';
import { listLowStock, getEntriesDaySummary, PURCHASE_CATEGORY } from './inventory.js';

// The daily close ("Cierre de día"): a truthful summary of the day's register,
// composed as a WhatsApp-friendly text. Delivered over WhatsApp (business number →
// owner's personal number), email, or just viewed in the dashboard.

export interface DigestSettings {
  enabled: boolean;
  channel: 'whatsapp' | 'email' | 'both';
  ownerPhone: string;
  ownerEmail: string;
  hour: number;        // local hour (0-23) after which the digest may send
  timezone: string;
  lastSentDay: string; // YYYY-MM-DD already delivered (dedupe)
}

export async function getDigestSettings(): Promise<DigestSettings> {
  const s = await getAllSettings();
  const channel = s['digest_channel'];
  return {
    enabled: s['digest_enabled'] === '1',
    channel: channel === 'email' || channel === 'both' ? channel : 'whatsapp',
    ownerPhone: s['digest_owner_phone'] || '',
    ownerEmail: s['digest_owner_email'] || '',
    hour: Number(s['digest_hour'] ?? '21') || 21,
    timezone: s['business_timezone'] || (await getSalesSettings()).timezone,
    lastSentDay: s['digest_last_sent_day'] || '',
  };
}

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Digest { day: string; subject: string; text: string; hasActivity: boolean }

// Build the close for a local day. Business context must be set by the caller.
export async function composeDigest(day: string): Promise<Digest> {
  const biz = currentBusinessId();
  const { timezone, paymentMethods } = await getSalesSettings();
  const label = (id: string) => paymentMethods.find((m) => m.id === id)?.label ?? id;

  const summary = await getDaySummary(day);
  const position = await getCashPosition(day);

  const topProducts = await many<{ name: string; qty: number }>(
    `SELECT si.name AS name, SUM(si.qty)::float8 AS qty
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.business_id = $1 AND s.status = 'completed' AND ${dayExpr('s.sold_at', timezone)} = $2
     GROUP BY si.name ORDER BY qty DESC LIMIT 3`,
    [biz, day],
  );
  const lowStock = (await listLowStock()).slice(0, 8);
  const entries = await getEntriesDaySummary(day);
  // Merchandise purchases are cash out today but they're already counted as COGS
  // when the goods sell — subtracting both would double-count them out of profit.
  const purchases = (await one<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0)::float8 AS total FROM cash_movements
      WHERE business_id = $1 AND kind = 'expense' AND category = $2 AND ${dayExpr('sold_at', timezone)} = $3`,
    [biz, PURCHASE_CATEGORY, day],
  ))?.total ?? 0;
  const pending = await one<{ n: number; total: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float8 AS total FROM charges WHERE business_id = $1 AND status = 'pending'`,
    [biz],
  );
  const name = (await one<{ name: string }>('SELECT name FROM businesses WHERE id = $1', [biz]))?.name || '';

  const nice = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date(`${day}T12:00:00Z`));
  const lines: string[] = [];
  lines.push(`📋 *Cierre del día* — ${name || 'tu negocio'}`);
  lines.push(nice);
  lines.push('');
  lines.push(`🧾 Ventas: *${money(summary.gross)}* (${summary.count})`);
  for (const m of summary.byMethod) lines.push(`   • ${label(m.method)}: ${money(m.total)} (${m.count})`);
  if (summary.fees > 0) lines.push(`💳 Comisiones: −${money(summary.fees)}`);
  lines.push(`💰 Neto de ventas: *${money(summary.net)}*`);
  if (position.expenses > 0) lines.push(`🔻 Gastos: −${money(position.expenses)}`);
  if (position.income > 0) lines.push(`🔺 Ingresos extra: +${money(position.income)}`);
  if (position.hasSession) lines.push(`🔓 Inicio de caja: ${money(position.opening)}`);
  lines.push(`🪙 Efectivo en caja${position.status === 'closed' ? ' (esperado)' : ''}: *${money(position.net)}*`);
  if (position.status === 'closed' && position.counted != null) {
    const diff = position.difference ?? 0;
    const verdict = diff === 0 ? 'cuadrado ✅' : diff > 0 ? `sobra ${money(diff)}` : `falta ${money(-diff)}`;
    lines.push(`🔎 Conteo: ${money(position.counted)} · ${verdict}`);
  }
  lines.push(`📈 Ganancia (neto − costo − gastos): *${money(Math.round((summary.net - summary.cost - (position.expenses - purchases)) * 100) / 100)}*`);
  if (topProducts.length > 0) {
    lines.push('');
    lines.push(`🏆 Más vendidos: ${topProducts.map((p) => `${p.name} (${p.qty})`).join(', ')}`);
  }
  if (entries.count > 0) {
    lines.push('');
    lines.push(`📦 Entradas de hoy: ${entries.count} recepci${entries.count === 1 ? 'ón' : 'ones'} (${money(entries.total)})`);
  }
  if (lowStock.length > 0) {
    lines.push('');
    lines.push(`⚠️ Stock bajo: ${lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}`);
  }
  if (pending && pending.n > 0) {
    lines.push('');
    lines.push(`⏳ Cobros pendientes: ${pending.n} (${money(pending.total)})`);
  }

  const hasActivity = summary.count > 0 || position.expenses > 0 || position.income > 0
    || entries.count > 0 || position.hasSession;
  return { day, subject: `Cierre del día ${day}${name ? ` — ${name}` : ''}`, text: lines.join('\n'), hasActivity };
}
