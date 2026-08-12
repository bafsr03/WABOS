'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { googleLogin, api } from '@/lib/api';
import { GOOGLE_STATE_KEY, GOOGLE_NONCE_KEY, GOOGLE_NEXT_KEY } from '@/components/SocialAuth';

// Where Google sends the browser back after "Continuar con Google" (see
// SocialAuth). The ID token arrives in the URL *fragment*, so it never reaches a
// server log or the Next.js router — we read it here, check it belongs to the
// request this tab started, and hand it to the same endpoint the old widget used.
//
// This route must be registered as an authorized redirect URI in Google Cloud
// Console, exactly: https://<your-domain>/auth/google

function decodeNonce(idToken: string): string | null {
  try {
    const body = idToken.split('.')[1];
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).nonce ?? null;
  } catch {
    return null;
  }
}

export default function GoogleCallback() {
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);

    const state = sessionStorage.getItem(GOOGLE_STATE_KEY);
    const nonce = sessionStorage.getItem(GOOGLE_NONCE_KEY);
    const next = sessionStorage.getItem(GOOGLE_NEXT_KEY) || '/';
    sessionStorage.removeItem(GOOGLE_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_NONCE_KEY);
    sessionStorage.removeItem(GOOGLE_NEXT_KEY);

    const idToken = hash.get('id_token');
    // Drop the token from the address bar before anything else — it stays in
    // history otherwise, and shoulder-surfing a phone is a real thing.
    window.history.replaceState(null, '', '/auth/google');

    const googleError = hash.get('error') || query.get('error');
    if (googleError) {
      setError(googleError === 'access_denied'
        ? 'Cancelaste el inicio con Google.'
        : `Google rechazó la solicitud (${googleError}).`);
      return;
    }
    if (!idToken || !state || hash.get('state') !== state) {
      setError('La respuesta de Google no coincide con esta sesión. Vuelve a intentarlo.');
      return;
    }
    if (decodeNonce(idToken) !== nonce) {
      setError('La respuesta de Google no coincide con esta sesión. Vuelve a intentarlo.');
      return;
    }

    (async () => {
      try {
        await googleLogin(idToken);
        // Resume the WhatsApp socket if a previous session paused it (best-effort).
        await api('/api/session/open', { method: 'POST' }).catch(() => {});
        window.location.href = next;
      } catch (err: any) {
        setError(err?.message ?? 'No se pudo iniciar sesión con Google');
      }
    })();
  }, []);

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-bg px-4 py-8">
      <div className="aurora pointer-events-none absolute inset-0" />
      <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
        <img src="/logo.png" alt="WABOS" width={40} height={40} className="mx-auto h-10 w-10 rounded-xl object-cover" />
        {error ? (
          <>
            <p className="mt-4 text-sm text-danger">{error}</p>
            <Link href="/login" className="mt-5 inline-block text-sm font-medium text-brand hover:underline">Volver a iniciar sesión</Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">Entrando con Google…</p>
        )}
      </div>
    </div>
  );
}
