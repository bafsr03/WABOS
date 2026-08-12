'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, Store, ArrowRight } from 'lucide-react';
import { register } from '@/lib/api';
import { Input, Button } from '@/components/ui/primitives';
import SocialAuth from '@/components/SocialAuth';

export default function RegisterPage() {
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return; }
    setLoading(true);
    setError('');
    try {
      await register(email.trim(), password, businessName.trim());
      // New tenant → go straight to linking WhatsApp. Hard load (not router.replace)
      // so an iOS standalone PWA stays fullscreen instead of dropping into Safari.
      window.location.href = '/connect';
    } catch (err: any) {
      setError(err.message ?? 'No se pudo crear la cuenta');
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
        <p className="mt-3 text-sm text-muted">Crea tu cuenta y conecta tu WhatsApp.</p>

        <label className="mt-7 mb-1.5 block text-sm font-medium text-fg">Nombre del negocio</label>
        <div className="relative">
          <Store size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Mi Tienda" className="pl-10" autoFocus required />
        </div>

        <label className="mt-4 mb-1.5 block text-sm font-medium text-fg">Correo</label>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.pe" className="pl-10" required />
        </div>

        <label className="mt-4 mb-1.5 block text-sm font-medium text-fg">Contraseña</label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="pl-10" required />
        </div>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <Button disabled={loading || !email || !password || !businessName} className="mt-5 w-full">
          {loading ? 'Creando…' : <>Crear cuenta <ArrowRight size={15} /></>}
        </Button>

        <SocialAuth next="/connect" />

        <p className="mt-4 text-center text-sm text-muted">
          ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-brand hover:underline">Inicia sesión</Link>
        </p>
      </motion.form>
    </div>
  );
}
