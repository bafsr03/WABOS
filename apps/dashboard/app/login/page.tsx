'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ENGINE_URL, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${ENGINE_URL}/api/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Token inválido');
      setToken(token);
      router.replace('/connect');
    } catch (err: any) {
      setError(err.message === 'Token inválido' ? 'Token inválido' : 'No se pudo conectar con el motor WABOS. ¿Está corriendo?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-2xl font-bold tracking-tight">
          WAB<span className="text-wa">OS</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">El sistema operativo para negocios en WhatsApp</p>
        <label className="mt-6 block text-sm font-medium">Token de acceso</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="DASHBOARD_TOKEN del motor"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          disabled={loading || !token}
          className="mt-4 w-full rounded-lg bg-wa-dark px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
