'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { login, api } from '@/lib/api';
import { Input, Button } from '@/components/ui/primitives';
import SocialAuth from '@/components/SocialAuth';

// The login screen, extracted so it can render both at /login AND at / (root) when
// the visitor isn't authenticated. Rendering it at / matters for iOS "Add to Home
// Screen": legacy iOS anchors a standalone PWA's scope to the URL it was added from,
// so the app must be installable at / — otherwise every other route falls out of
// scope and opens in Safari's in-app browser chrome.
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Arriving from a completed password reset.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      setNotice('Tu contraseña se actualizó. Inicia sesión con la nueva.');
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      // Resume the WhatsApp socket if a previous session paused it (best-effort).
      await api('/api/session/open', { method: 'POST' }).catch(() => {});
      // Reload / in place (now authenticated → dashboard). Staying on the root path
      // keeps an iOS home-screen launch inside its standalone scope.
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message ?? 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-bg px-4 py-[10dvh]">
      <div className="aurora pointer-events-none absolute inset-0" />

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="glass glow-brand w-full max-w-sm rounded-2xl p-8"
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="WABOS" width={40} height={40} className="h-10 w-10 rounded-xl object-cover shadow-[0_6px_18px_-4px_var(--brand)]" />
          <span className="font-display text-2xl font-semibold tracking-tight text-fg">WAB<span className="text-brand">OS</span></span>
        </div>
        <p className="mt-3 text-sm text-muted">Inicia sesión en tu cuenta.</p>

        {notice && <p className="mt-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-fg">{notice}</p>}

        <label className="mt-7 mb-1.5 block text-sm font-medium text-fg">Correo</label>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.pe" className="pl-10" autoFocus required />
        </div>

        <div className="mt-4 mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-medium text-fg">Contraseña</label>
          <Link href="/forgot" className="text-xs text-muted hover:text-brand hover:underline">¿Olvidaste tu contraseña?</Link>
        </div>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10" required />
        </div>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <Button disabled={loading || !email || !password} className="mt-5 w-full">
          {loading ? 'Ingresando…' : <>Entrar <ArrowRight size={15} /></>}
        </Button>

        <SocialAuth next="/" />

        <p className="mt-4 text-center text-sm text-muted">
          ¿No tienes cuenta? <Link href="/register" className="font-medium text-brand hover:underline">Regístrate</Link>
        </p>
      </motion.form>
    </div>
  );
}
