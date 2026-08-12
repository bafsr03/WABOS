'use client';

import { useState } from 'react';

// Google sign-in, our own button.
//
// We used to render Google's official widget (accounts.google.com/gsi/client).
// It is their markup styled by their cross-origin stylesheet, which our CSS
// cannot reach — and on iOS Safari that stylesheet lands wrong: a white slab and
// an oversized white disc behind the G, which on our dark card reads as a broken
// page. There is no way to fix someone else's stylesheet from outside, so the
// widget is gone.
//
// Instead we send the browser to Google's OpenID Connect endpoint with
// response_type=id_token and come back to /auth/google with the token in the URL
// fragment. That is the same ID token the widget used to hand us, so the server
// side (POST /api/auth/google, verified against Google's JWKS) is untouched, and
// no client secret is involved. Full-page redirect also sidesteps the popup and
// tap-target problems that mobile webviews cause.
//
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID *and* this exact URI registered as an
// authorized redirect URI on that client in Google Cloud Console:
//   https://<your-domain>/auth/google

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// Keys the /auth/google page reads back to validate the response.
export const GOOGLE_STATE_KEY = 'wabos_google_state';
export const GOOGLE_NONCE_KEY = 'wabos_google_nonce';
export const GOOGLE_NEXT_KEY = 'wabos_google_next';

// In-app browsers (WhatsApp/Instagram/Facebook/TikTok webviews) are blocked by
// Google's sign-in for security ("disallowed_useragent"), so this will never work
// there. Detect the common ones so we can tell the user to open the page in a
// real browser instead of leaving them stuck.
function isEmbeddedBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Standalone (installed PWA) is a real browser context — never flag it.
  const standalone = (window.navigator as any).standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone) return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|; wv\)|WebView/i.test(ua);
}

export default function SocialAuth({ next = '/' }: {
  /** Where to land once Google comes back and the session is live. */
  next?: string;
}) {
  const [going, setGoing] = useState(false);
  const embedded = typeof window !== 'undefined' && isEmbeddedBrowser();

  function start() {
    setGoing(true);
    // state ties the response to this tab; nonce ties the ID token to this
    // request. /auth/google refuses anything that doesn't match both.
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(GOOGLE_STATE_KEY, state);
    sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
    sessionStorage.setItem(GOOGLE_NEXT_KEY, next);

    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('response_type', 'id_token');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('redirect_uri', `${window.location.origin}/auth/google`);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    // Always let them pick the account — shared phones are the norm here.
    url.searchParams.set('prompt', 'select_account');
    window.location.href = url.toString();
  }

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
        <button
          type="button"
          onClick={start}
          disabled={going}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface-2 text-sm font-medium text-fg transition hover:border-border-strong hover:bg-surface-3 disabled:opacity-60"
        >
          <GoogleMark />
          {going ? 'Abriendo Google…' : 'Continuar con Google'}
        </button>
      )}
    </div>
  );
}

// Google's mark, inlined. Their branding rules want the logo unaltered on a
// button we may otherwise style, and inlining keeps it identical in both themes
// with no network request.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
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
