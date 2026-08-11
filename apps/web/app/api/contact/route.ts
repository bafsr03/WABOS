/**
 * Contact form intake.
 *
 * The browser posts here (same-origin, so no CORS), and this handler forwards
 * server-side to the engine over the Docker network. It cannot post to the
 * engine directly because the engine's CORS is locked to the dashboard origin.
 *
 * The engine repeats every one of these checks — this tier is the cheap first
 * filter, not the security boundary.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENGINE_ORIGIN = process.env.ENGINE_ORIGIN ?? 'http://localhost:4000';
const CONTACT_SECRET = process.env.CONTACT_SECRET ?? '';

const MAX_BODY_BYTES = 8 * 1024;
const MIN_FILL_MS = 3000;          // faster than a human could plausibly type
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Per-IP counters. Module scope: fine for a single long-lived Node process. */
const hits = new Map<string, number[]>();
const SHORT_WINDOW = 10 * 60_000;
const LONG_WINDOW = 24 * 60 * 60_000;
const SHORT_LIMIT = 3;
const LONG_LIMIT = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < LONG_WINDOW);
  const recent = seen.filter((t) => now - t < SHORT_WINDOW);
  if (recent.length >= SHORT_LIMIT || seen.length >= LONG_LIMIT) {
    hits.set(ip, seen);
    return true;
  }
  seen.push(now);
  hits.set(ip, seen);

  // Bound memory: drop IPs whose entries have all aged out.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < LONG_WINDOW)) hits.delete(k);
    }
  }
  return false;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function POST(req: Request) {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) {
    return Response.json({ error: 'Mensaje demasiado largo.' }, { status: 413 });
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  // Honeypot and timing traps: answer 200 so bots learn nothing, but send nothing.
  if (str(body.website)) return Response.json({ ok: true });
  const renderedAt = Number(body.renderedAt ?? 0);
  if (renderedAt && Date.now() - renderedAt < MIN_FILL_MS) return Response.json({ ok: true });

  const nombre = str(body.nombre);
  const email = str(body.email).toLowerCase();
  const mensaje = str(body.mensaje);
  const negocio = str(body.negocio);
  const telefono = str(body.telefono);

  if (nombre.length < 2 || nombre.length > 80
    || !EMAIL_RE.test(email) || email.length > 160
    || mensaje.length < 10 || mensaje.length > 2000
    || negocio.length > 120
    || telefono.length > 30 || (telefono && !/^[\d+\s()-]+$/.test(telefono))) {
    return Response.json({ error: 'Revisa los datos del formulario.' }, { status: 400 });
  }

  if (rateLimited(ip)) {
    return Response.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  try {
    const res = await fetch(`${ENGINE_ORIGIN}/api/public/contact`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
        ...(CONTACT_SECRET ? { 'x-wabos-contact': CONTACT_SECRET } : null),
      },
      body: JSON.stringify({ nombre, email, mensaje, negocio, telefono }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) return Response.json({ ok: true });
    if (res.status === 429) {
      return Response.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
    }
    console.error('[contact] engine responded', res.status, await res.text().catch(() => ''));
    return Response.json({ error: 'No se pudo enviar el mensaje.' }, { status: 502 });
  } catch (err) {
    console.error('[contact] engine unreachable', err);
    return Response.json({ error: 'No se pudo enviar el mensaje.' }, { status: 502 });
  }
}
