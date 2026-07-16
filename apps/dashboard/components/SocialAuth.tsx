'use client';

import { useEffect, useRef } from 'react';
import { googleLogin } from '@/lib/api';

// Social sign-in. Google uses Google Identity Services: the button returns an ID
// token we verify server-side. Google's own button can't be restyled to our
// rounded-xl, so we render it transparently ON TOP of a custom-styled button —
// the user sees our button, the click lands on Google's. Set
// NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable it.

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export default function SocialAuth({ onAuthed, onError }: {
  onAuthed: () => void;
  onError: (msg: string) => void;
}) {
  const googleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !googleRef.current) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !googleRef.current) return;
      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: any) => {
          try { await googleLogin(resp.credential); onAuthed(); }
          catch (e: any) { onError(e?.message ?? 'No se pudo iniciar con Google'); }
        },
      });
      g.accounts.id.renderButton(googleRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'es', width: 340 });
    };
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, [onAuthed, onError]);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-subtle">o</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="relative mt-4">
        {/* Visible, on-brand button (purely visual — clicks pass through) */}
        <div className="pointer-events-none flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface-2 py-2.5 text-sm font-medium text-fg">
          <GoogleIcon /> Continuar con Google
        </div>
        {/* Real Google button, transparent, overlaid to catch the click */}
        {CLIENT_ID && (
          <div
            ref={googleRef}
            aria-hidden
            className="absolute inset-0 overflow-hidden opacity-[0.0001] [&>div]:!h-full [&>div]:!w-full [&_iframe]:!h-full [&_iframe]:!w-full"
          />
        )}
      </div>
      {!CLIENT_ID && (
        <p className="mt-2 text-center text-xs text-subtle">Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID para habilitar Google</p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 14.1 6 6 14.1 6 24s8.1 18 18 18 18-8.1 18-18c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M8.3 14.7l6.6 4.8C16.6 15.9 19.9 14 24 14c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 16.3 6 9.7 10.3 8.3 14.7z" />
      <path fill="#4CAF50" d="M24 42c5.2 0 9.8-2 13.3-5.2l-6.2-5.2C29.1 33 26.7 34 24 34c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 37.6 16.2 42 24 42z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.2 5.2C41 36 43.9 30.6 43.9 24c0-1.2-.1-2.3-.3-3.5z" />
    </svg>
  );
}
