'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, AlertCircle, Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SUPPORT_EMAIL, REGISTER_URL } from '@/lib/site';
import { Button } from '../ui';

type Status = 'idle' | 'sending' | 'ok' | 'error' | 'rate';
type Errors = Partial<Record<'nombre' | 'email' | 'mensaje', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function validate(v: { nombre: string; email: string; mensaje: string }): Errors {
  const e: Errors = {};
  if (v.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.';
  else if (v.nombre.trim().length > 80) e.nombre = 'Máximo 80 caracteres.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Escribe un correo válido.';
  if (v.mensaje.trim().length < 10) e.mensaje = 'Cuéntanos un poco más (mínimo 10 caracteres).';
  else if (v.mensaje.trim().length > 2000) e.mensaje = 'Máximo 2000 caracteres.';
  return e;
}

export function ContactForm() {
  const [values, setValues] = useState({ nombre: '', email: '', negocio: '', telefono: '', mensaje: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>('idle');
  const reduced = useReducedMotion();

  // Honeypot + timing: bots fill hidden fields and submit instantly.
  const honeypot = useRef('');
  const renderedAt = useRef(0);
  useEffect(() => { renderedAt.current = Date.now(); }, []);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k as keyof Errors]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;

    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, website: honeypot.current, renderedAt: renderedAt.current }),
      });
      if (res.ok) setStatus('ok');
      else if (res.status === 429) setStatus('rate');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'ok') {
    return (
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-8 text-center"
      >
        <motion.span
          initial={reduced ? undefined : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success"
        >
          <Check size={26} />
        </motion.span>
        <h2 className="mt-5 text-xl font-semibold text-fg">Mensaje enviado</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Te responderemos a <strong className="text-fg">{values.email}</strong> lo antes posible.
          Normalmente contestamos el mismo día hábil.
        </p>
        <div className="mt-7">
          <Button href={REGISTER_URL} external size="lg" variant="secondary">
            Mientras tanto, prueba WABOS
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card p-7 sm:p-8">
      {/* Honeypot: positioned off-screen rather than display:none, which bots skip. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">No llenar</label>
        <input
          id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
          onChange={(e) => { honeypot.current = e.target.value; }}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="nombre" label="Tu nombre" error={errors.nombre} required>
          <input
            id="nombre" value={values.nombre} onChange={set('nombre')} maxLength={80} autoComplete="name"
            className={inputCls(!!errors.nombre)}
            aria-invalid={!!errors.nombre} aria-describedby={errors.nombre ? 'nombre-err' : undefined}
          />
        </Field>

        <Field id="email" label="Correo" error={errors.email} required>
          <input
            id="email" type="email" value={values.email} onChange={set('email')} maxLength={160} autoComplete="email"
            className={inputCls(!!errors.email)}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined}
          />
        </Field>

        <Field id="negocio" label="Tu negocio" hint="Opcional">
          <input id="negocio" value={values.negocio} onChange={set('negocio')} maxLength={120} className={inputCls(false)} />
        </Field>

        <Field id="telefono" label="Teléfono" hint="Opcional">
          <input id="telefono" type="tel" value={values.telefono} onChange={set('telefono')} maxLength={30} autoComplete="tel" className={inputCls(false)} />
        </Field>
      </div>

      <div className="mt-5">
        <Field id="mensaje" label="¿En qué te ayudamos?" error={errors.mensaje} required>
          <textarea
            id="mensaje" value={values.mensaje} onChange={set('mensaje')} rows={5} maxLength={2000}
            className={cn(inputCls(!!errors.mensaje), 'resize-y')}
            aria-invalid={!!errors.mensaje} aria-describedby={errors.mensaje ? 'mensaje-err' : undefined}
          />
        </Field>
      </div>

      <AnimatePresence>
        {(status === 'error' || status === 'rate') && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? undefined : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.07] p-4 text-sm">
              <AlertCircle size={17} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-muted">
                {status === 'rate'
                  ? 'Recibimos varios mensajes tuyos hace poco. Espera unos minutos antes de volver a intentar.'
                  : <>No pudimos enviar tu mensaje. Escríbenos directamente a{' '}
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-glow hover:underline">{SUPPORT_EMAIL}</a>.</>}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={status === 'sending'}>
          {status === 'sending' ? 'Enviando…' : <>Enviar mensaje <Send size={15} /></>}
        </Button>
        <p className="text-xs leading-relaxed text-subtle">
          Al enviar aceptas que te contactemos sobre WABOS. No compartimos tu correo con nadie.
        </p>
      </div>

      <noscript>
        <p className="mt-5 text-sm text-muted">
          Necesitas JavaScript para usar el formulario. Escríbenos a{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-glow underline">{SUPPORT_EMAIL}</a>.
        </p>
      </noscript>
    </form>
  );
}

const inputCls = (invalid: boolean) =>
  cn(
    'w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none transition-colors',
    'placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-[var(--ring)]',
    invalid ? 'border-danger/60' : 'border-border',
  );

function Field({
  id, label, hint, error, required, children,
}: {
  id: string; label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-fg">
        {label}
        {required && <span className="text-danger" aria-hidden>*</span>}
        {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
      </label>
      {children}
      {error && <p id={`${id}-err`} className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
