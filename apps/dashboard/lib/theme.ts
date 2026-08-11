// Theme preference. Deliberately React-free so lib/native.ts can import it
// without a cycle, and so the no-flash <script> can share the same key name.

export type ThemePref = 'light' | 'dark' | 'system';
export type Resolved = 'light' | 'dark';

/** Must match the key used by the inline script in ThemeScript.tsx. */
export const THEME_KEY = 'wabos_theme';

/** Keep in sync with --bg in the .dark block of app/globals.css. */
const DARK_BG = '#0f1119';
/** Light keeps the brand colour, which is what the PWA installed as. */
const LIGHT_THEME_COLOR = '#5b4bff';

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getPref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    // Safari private mode can throw on localStorage.
    return 'system';
  }
}

export function setPref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* non-fatal: the theme just won't persist */ }
}

export function resolve(pref: ThemePref): Resolved {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}

export function getResolvedTheme(): Resolved {
  return resolve(getPref());
}

/**
 * The single place that mutates the DOM for theming, so the inline script and
 * the React provider can never drift apart.
 */
export function applyTheme(r: Resolved) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('dark', r === 'dark');
  el.style.colorScheme = r;

  // Browser chrome. Next emits <meta name="theme-color"> from `viewport`, keyed
  // to the OS preference; this overrides it for an explicit in-app choice.
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', r === 'dark' ? DARK_BG : LIGHT_THEME_COLOR);

  // iOS reads this at launch for an installed PWA, so it takes effect on the
  // next launch rather than immediately. Set it anyway — it costs nothing.
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', r === 'dark' ? 'black-translucent' : 'default');
}
