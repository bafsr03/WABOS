'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';

interface Status {
  status: string;
  qrDataUrl: string | null;
  me: { id: string; name?: string } | null;
  aiAvailable: boolean;
}

export default function ConnectPage() {
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = useCallback(() => {
    api<Status>('/api/status').then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // QR rotates every ~30s and connection state changes are pushed over WS
    return connectWs((event) => {
      if (event.type === 'wa.status') refresh();
    });
  }, [refresh]);

  async function logout() {
    if (!confirm('¿Desvincular este número de WhatsApp? Tendrás que escanear el QR de nuevo.')) return;
    await api('/api/logout', { method: 'POST' });
    refresh();
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Conexión de WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-500">Vincula el número de tu negocio para que WABOS trabaje por ti.</p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {!status && <p className="text-slate-500">Cargando…</p>}

          {status?.status === 'connected' && (
            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
              <h2 className="mt-4 text-lg font-semibold">WhatsApp conectado</h2>
              <p className="mt-1 text-sm text-slate-500">
                {status.me?.name ? `${status.me.name} — ` : ''}{status.me?.id?.split(':')[0]?.split('@')[0]}
              </p>
              {!status.aiAvailable && (
                <p className="mx-auto mt-4 max-w-sm rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                  ⚠️ Sin ANTHROPIC_API_KEY el Empleado IA está desactivado: todas las conversaciones
                  requieren respuesta humana.
                </p>
              )}
              <button
                onClick={logout}
                className="mt-6 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Desvincular número
              </button>
            </div>
          )}

          {status?.status === 'qr' && status.qrDataUrl && (
            <div>
              <h2 className="text-lg font-semibold">Escanea este código QR</h2>
              <ol className="mx-auto mt-2 max-w-sm text-left text-sm text-slate-500">
                <li>1. Abre WhatsApp en el teléfono del negocio</li>
                <li>2. Ajustes → Dispositivos vinculados</li>
                <li>3. Vincular un dispositivo → escanea el código</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={status.qrDataUrl} alt="QR de WhatsApp" className="mx-auto mt-4 h-64 w-64 rounded-lg border" />
              <p className="mt-2 text-xs text-slate-400">El código se renueva automáticamente.</p>
            </div>
          )}

          {status && status.status !== 'connected' && status.status !== 'qr' && (
            <div>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-wa-dark" />
              <p className="mt-4 text-sm text-slate-500">Estado: {status.status}… esperando conexión con WhatsApp</p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
