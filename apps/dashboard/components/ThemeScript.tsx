/**
 * Blocking inline script. Must be the first thing in <head> so the class is on
 * <html> before the first paint — otherwise a dark-mode user gets a white flash
 * on every navigation, which is the single most common way this ships broken.
 *
 * Wrapped in try/catch because Safari private browsing throws on localStorage,
 * and an exception here would leave the page unstyled.
 *
 * It deliberately does NOT touch <meta name="theme-color">: Next emits that tag
 * itself and its position relative to this script isn't guaranteed. The provider
 * handles it a paint later, which only affects browser chrome.
 *
 * Key must stay in sync with THEME_KEY in lib/theme.ts.
 */
const SCRIPT = `(function(){try{var p=localStorage.getItem('wabos_theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;if(d)e.classList.add('dark');e.style.colorScheme=d?'dark':'light';}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
