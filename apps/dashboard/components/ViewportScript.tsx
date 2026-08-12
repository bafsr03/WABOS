/**
 * Blocking inline script, next to ThemeScript in <head>: publishes the real
 * window height as --app-h, in pixels.
 *
 * Why this exists. The shell is a full-height box that never scrolls, with the
 * page scrolling inside it — that's what keeps the floating nav bar off the
 * content. Two separate things make "full height" hard in an iOS web view, and
 * the bar showed us both:
 *
 *  1. window.innerHeight is SHORT of the window there. Sizing the shell against
 *     it left the bar floating ~55px above the bottom of the screen with dead
 *     space under it, and every page's content stopping equally short.
 *     `height: -webkit-fill-available` is the one length that resolves to the
 *     real window on iOS (that's why html/body already used it), so that's what
 *     we measure — this script just reads it and hands it on as a number.
 *
 *  2. -webkit-fill-available is not a *definite* height, so `height: 100%` on
 *     the shell inside it silently resolved to auto — i.e. to the height of the
 *     page's content. The shell then ran taller than the screen, the document
 *     became scrollable, and iOS anchors `position: fixed` to the layout
 *     viewport, which drifts once the document scrolls. That is why one nav bar
 *     with one set of rules sat lower on a long page than on a short one.
 *
 * A px length fixes (2) by construction and measuring fill-available fixes (1),
 * so everything downstream — h-full, min-h-full, the bar's `absolute bottom-0`
 * — becomes ordinary CSS that resolves the way the layout assumes.
 *
 * The probe has to run with --app-h cleared, or it just measures its own last
 * answer. It is appended and removed synchronously, so it never paints.
 *
 * Deliberately reads innerHeight and not visualViewport.height: the keyboard
 * shrinks the visual viewport, and the shell must not resize under it.
 */
const SCRIPT = `(function(){try{
var e=document.documentElement;
function fill(){
  if(!document.body)return 0;
  var prev=e.style.getPropertyValue('--app-h');
  if(prev)e.style.removeProperty('--app-h');
  var d=document.createElement('div');
  d.style.cssText='position:static;width:0;height:-webkit-fill-available;visibility:hidden;pointer-events:none';
  document.body.appendChild(d);
  var h=d.getBoundingClientRect().height;
  d.remove();
  if(prev)e.style.setProperty('--app-h',prev);
  return h;
}
function standalone(){try{return navigator.standalone===true||matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches;}catch(x){return false;}}
function probe(v){
  if(!document.body)return 0;
  var d=document.createElement('div');
  d.style.cssText='position:fixed;top:0;left:0;width:0;height:'+v+';visibility:hidden;pointer-events:none';
  document.body.appendChild(d);
  var h=d.getBoundingClientRect().height;
  d.remove();
  return h;
}
function set(){
  var ih=window.innerHeight||0;
  if(!ih)return;
  var h=ih;
  /* Take the tallest candidate that is still plausibly the window. A notch
     plus a home indicator is under ~150px, so anything beyond innerHeight+160
     measured something else (page content, or a browser's screen behind its
     own chrome) and using it would push the nav bar off the bottom. */
  var cap=ih+160;
  var fa=fill();
  if(fa>h&&fa<cap)h=fa;
  /* Installed to the home screen only. There is no browser chrome there, so
     100lvh — the viewport with chrome retracted — can only mean the window;
     measured on a real iPhone in Safari it reads 741 against innerHeight 659,
     i.e. it sees past what innerHeight admits to. In a browser that gap IS the
     toolbars, so taking it would hide the nav bar underneath them. */
  if(standalone()){var lv=probe('100lvh');if(lv>h&&lv<cap)h=lv;}
  /* screen.height is deliberately NOT a candidate. If the web view is smaller
     than the screen, sizing the shell to the screen doesn't reclaim those
     pixels — it just draws the nav bar into the strip the web view can't
     paint, i.e. off the bottom. Whether the web view owns the whole screen is
     a question for the native shell, not for CSS. */
  e.style.setProperty('--app-h',Math.round(h)+'px');
}
set();
if(!document.body)document.addEventListener('DOMContentLoaded',set);
addEventListener('load',set);
addEventListener('resize',set);
addEventListener('pageshow',set);
addEventListener('orientationchange',function(){set();setTimeout(set,120);setTimeout(set,400);});
if(window.visualViewport)visualViewport.addEventListener('resize',set);
}catch(e){}})()`;

export function ViewportScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
