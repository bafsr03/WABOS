'use client';

import { useEffect, useRef, useState } from 'react';
import { googleLogin } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';

// Social sign-in. Google uses Google Identity Services: the button returns an ID
// token we verify server-side. We render Google's OWN official button (rather than
// hiding it under a custom-styled one) because on mobile the transparent-overlay
// trick often eats the tap and the sign-in silently fails. Set
// NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable it.

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// In-app browsers (WhatsApp/Instagram/Facebook/TikTok webviews) are blocked by
// Google's sign-in for security ("disallowed_useragent"), so the button will
// never work there. Detect the common ones so we can tell the user to open the
// page in a real browser instead of leaving them stuck.
function isEmbeddedBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Standalone (installed PWA) is a real browser context — never flag it.
  const standalone = (window.navigator as any).standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone) return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|; wv\)|WebView/i.test(ua);
}

export default function SocialAuth({ onAuthed, onError }: {
  onAuthed: () => void;
  onError: (msg: string) => void;
}) {
  const googleRef = useRef<HTMLDivElement>(null);
  const [embedded, setEmbedded] = useState(false);
  const [ready, setReady] = useState(false);
  const { resolved } = useTheme();

  useEffect(() => {
    if (!CLIENT_ID) return;
    if (isEmbeddedBrowser()) { setEmbedded(true); return; }
    if (!googleRef.current) return;

    // Google renders into a cross-origin iframe, so CSS can't reach it — the
    // only lever is its own `theme` option, which means re-rendering the button
    // whenever ours changes. Hence `resolved` in the deps.
    const render = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !googleRef.current) {
        onError('Google no está disponible en este navegador. Ábrelo en Safari o Chrome.');
        return;
      }
      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: any) => {
          try { await googleLogin(resp.credential); onAuthed(); }
          catch (e: any) { onError(e?.message ?? 'No se pudo iniciar con Google'); }
        },
      });
      // Replace rather than append — renderButton adds a child each call.
      googleRef.current.innerHTML = '';
      const width = Math.min(googleRef.current.offsetWidth || 340, 400);
      g.accounts.id.renderButton(googleRef.current, {
        type: 'standard',
        theme: resolved === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with', shape: 'pill', locale: 'es', width,
      });
      setReady(true);
    };

    // Already loaded (e.g. a theme flip): just re-render, don't refetch.
    if ((window as any).google?.accounts?.id) { render(); return; }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onerror = () => onError('No se pudo cargar Google. Revisa tu conexión o abre la página en Safari o Chrome.');
    script.onload = render;
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, [onAuthed, onError, resolved]);

  if (!CLIENT_ID) {
    return (
      <div className="mt-5">
        <Divider />
        <p className="mt-3 text-center text-xs text-subtle">Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID para habilitar Google</p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <Divider />

      {embedded ? (
        // Google refuses to run inside app webviews — guide the user out.
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-center text-sm text-fg">
          <p className="font-medium">Para continuar con Google, abre WABOS en tu navegador</p>
          <p className="mt-1 text-xs text-muted">
            Toca el menú (•••) arriba y elige <b>“Abrir en Safari”</b> o <b>“Abrir en Chrome”</b>.
            Google no permite iniciar sesión dentro de WhatsApp u otras apps.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex justify-center">
          <div className="relative w-full max-w-[340px]">
            {/* Google renders its official button here. */}
            <div ref={googleRef} className="[&>div]:!w-full [&_iframe]:!mx-auto" />
            {!ready && <div className="absolute inset-0 h-11 animate-pulse rounded-full bg-surface-2" />}
          </div>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-subtle">o</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
