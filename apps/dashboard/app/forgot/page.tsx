'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requestPasswordReset } from '@/lib/api';
import { Input, Button } from '@/components/ui/primitives';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo enviar el enlace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-bg px-4 py-8">
      <div className="aurora pointer-events-none absolute inset-0" />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="glass glow-brand w-full max-w-sm rounded-2xl p-8"
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="WABOS" width={40} height={40} className="h-10 w-10 rounded-xl object-cover shadow-[0_6px_18px_-4px_var(--brand)]" />
          <span className="font-display text-2xl font-semibold tracking-tight text-fg">WAB<span className="text-brand">OS</span></span>
        </div>

        {sent ? (
          <>
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 p-4">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
              <p className="text-sm text-fg">Si <b>{email}</b> tiene una cuenta, te enviamos un enlace para restablecer tu contraseña. Revisa tu correo (y spam). El enlace vence en 1 hora.</p>
            </div>
            <Link href="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><ArrowLeft size={15} /> Volver a iniciar sesión</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="mt-3 text-sm text-muted">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>

            <label className="mt-7 mb-1.5 block text-sm font-medium text-fg">Correo</label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.pe" className="pl-10" autoFocus required />
            </div>

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}

            <Button disabled={loading || !email} className="mt-5 w-full">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </Button>

            <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Volver a iniciar sesión</Link>
          </form>
        )}
      </motion.div>
    </div>
  );
}
