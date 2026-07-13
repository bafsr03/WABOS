// Deterministic parsers for Yape/Plin/bank confirmation emails. Regex, not AI:
// these are structured templates, so parsing is cheaper, faster and free of
// token cost. Each parser returns null when the text isn't a payment it can read.

export interface ParsedNotification {
  provider: 'yape' | 'plin' | 'transfer' | 'other';
  amount: number | null;
  currency: string;
  operationNumber: string | null;
  senderName: string | null;
}

// "S/ 1,234.50" | "S/1234.5" | "PEN 50.00" → 1234.5 / 50
function parseAmount(text: string): { amount: number | null; currency: string } {
  const m = text.match(/(S\/\.?|PEN|US\$|\$)\s*([\d.,]+)/i);
  if (!m) return { amount: null, currency: 'PEN' };
  const currency = /\$|US/i.test(m[1]) ? 'USD' : 'PEN';
  // Strip a trailing sentence period/comma the greedy match may have grabbed,
  // then normalize: remove thousands separators, keep the last dot as decimal.
  let n = m[2].replace(/[.,]+$/, '').replace(/,/g, '');
  const parts = n.split('.');
  if (parts.length > 2) n = parts.slice(0, -1).join('') + '.' + parts.at(-1);
  const amount = Number(n);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

const OP_PATTERNS = [
  /(?:n[°º.]?\s*de\s*operaci[oó]n|c[oó]digo\s*de\s*operaci[oó]n|operaci[oó]n(?:\s*n[°º.]?)?)\s*[:#]?\s*([A-Z0-9-]{4,})/i,
  /\boperaci[oó]n\b[^0-9]{0,20}(\d{5,})/i,
];

const SENDER_PATTERNS = [
  /(?:de|from|pagador|env[ií]a|realizado por)\s*[:]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ.\s]{3,40})/i,
];

// Detect provider from sender domain + body wording.
function detectProvider(from: string, text: string): ParsedNotification['provider'] | null {
  const f = from.toLowerCase();
  const t = text.toLowerCase();
  if (f.includes('yape') || t.includes('yapeaste') || t.includes('yapeo') || t.includes('yape')) return 'yape';
  if (t.includes('plin') || t.includes('plineaste')) return 'plin';
  if (f.includes('viabcp') || f.includes('interbank') || f.includes('bbva') || f.includes('scotiabank') ||
      t.includes('transferencia') || t.includes('constancia')) return 'transfer';
  return null;
}

// Is this even a payment-confirmation email? Guards against newsletters etc.
function looksLikePayment(text: string): boolean {
  const t = text.toLowerCase();
  return /(pag|yape|plin|transfer|operaci[oó]n|constancia|recib)/.test(t) && /(s\/|pen|\$)/i.test(t);
}

export function parseNotificationEmail(input: {
  from: string;
  subject: string;
  text: string;
}): ParsedNotification | null {
  const body = `${input.subject}\n${input.text}`;
  if (!looksLikePayment(body)) return null;

  const provider = detectProvider(input.from, body) ?? 'other';
  const { amount, currency } = parseAmount(body);
  if (amount === null) return null; // no readable amount → not a usable notification

  return {
    provider,
    amount,
    currency,
    operationNumber: firstMatch(body, OP_PATTERNS),
    senderName: firstMatch(body, SENDER_PATTERNS),
  };
}
