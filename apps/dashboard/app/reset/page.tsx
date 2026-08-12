'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, ArrowLeft } from 'lucide-react';
import { resetPassword } from '@/lib/api';
import { Input, Button } from '@/components/ui/primitives';

export default function ResetPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Read the token from the emailed link (?token=…) without needing Suspense.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(token, password);
      router.replace('/login?reset=1');
    } catch (err: any) {
      setError(err.message ?? 'No se pudo restablecer la contraseña');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-bg px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
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
        <p className="mt-3 text-sm text-muted">Elige una nueva contraseña.</p>

        {!token && <p className="mt-4 text-sm text-danger">Falta el enlace de restablecimiento. Solicita uno nuevo desde <Link href="/forgot" className="font-medium underline">¿Olvidaste tu contraseña?</Link></p>}

        <label className="mt-7 mb-1.5 block text-sm font-medium text-fg">Nueva contraseña</label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="pl-10" autoFocus required minLength={8} />
        </div>

        <label className="mt-4 mb-1.5 block text-sm font-medium text-fg">Confirmar contraseña</label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" className="pl-10" required minLength={8} />
        </div>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <Button disabled={loading || !token || !password || !confirm} className="mt-5 w-full">
          {loading ? 'Guardando…' : 'Restablecer contraseña'}
        </Button>

        <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Volver a iniciar sesión</Link>
      </motion.form>
    </div>
  );
}
