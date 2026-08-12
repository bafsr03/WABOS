/**
 * Blocking inline script, next to ThemeScript in <head>: publishes the real
 * window height as --app-h before the first paint.
 *
 * Why this exists. The shell is a full-height box that never scrolls, with the
 * page scrolling inside it — that's what keeps the floating nav bar off the
 * content. Getting "full height" in an iOS web view took three tries: 100vh
 * overshoots, 100dvh undershoots (it resolves to the safe area, not the window,
 * leaving a dead band), and `height: -webkit-fill-available` on html/body paints
 * correctly but does NOT give a *definite* height — so `height: 100%` on the
 * shell inside it resolves to auto, i.e. to the height of the page's content.
 *
 * That last one is silent and nasty. The shell ends up taller than the screen on
 * a content-heavy page and exactly screen-height on an empty one, the document
 * becomes scrollable, and iOS anchors `position: fixed` to the layout viewport —
 * which drifts once the document scrolls. That is why the same nav bar, one
 * element with one set of rules, sat at a different height on Conversaciones
 * than on Catálogo, and why pinning it to the shell box instead made it vanish
 * below the fold.
 *
 * window.innerHeight is the one number the web view reports honestly, so the
 * shell is sized against that and everything downstream becomes ordinary CSS.
 * Note it deliberately reads innerHeight and not visualViewport.height: the
 * keyboard shrinks the visual viewport, and the shell must not resize under it.
 */
const SCRIPT = `(function(){try{var e=document.documentElement;var set=function(){var h=window.innerHeight;if(h)e.style.setProperty('--app-h',h+'px');};set();addEventListener('resize',set);addEventListener('orientationchange',function(){set();setTimeout(set,120);setTimeout(set,400);});addEventListener('pageshow',set);if(window.visualViewport)visualViewport.addEventListener('resize',set);}catch(e){}})()`;

export function ViewportScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
