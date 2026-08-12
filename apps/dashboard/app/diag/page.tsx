'use client';

import { useEffect, useState } from 'react';

// Layout diagnostics for the phone. Nothing on a desktop tells you why an
// installed iOS app leaves a strip of dead space at the bottom — the answer is
// in how that device resolves the viewport units, and this prints them. Open
// /diag on the phone, screenshot, compare. The red hairline is drawn at the very
// bottom of the document: if there's black below it, the document is shorter
// than the window; if it sits under the home indicator, the document is right
// and the gap is coming from somewhere else.

const rows: [string, () => string][] = [
  ['window.innerHeight', () => String(window.innerHeight)],
  ['--app-h', () => document.documentElement.style.getPropertyValue('--app-h') || 'UNSET'],
  ['document height', () => String(document.documentElement.scrollHeight)],
  ['body height', () => String(Math.round(document.body.getBoundingClientRect().height))],
  ['screen.height', () => String(window.screen.height)],
  ['screen − inner', () => String(window.screen.height - window.innerHeight)],
  ['visualViewport', () => (window.visualViewport ? `${Math.round(window.visualViewport.height)}` : 'n/a')],
  ['100dvh', () => measure('100dvh')],
  ['100svh', () => measure('100svh')],
  ['100lvh', () => measure('100lvh')],
  ['-webkit-fill-available', () => measure('-webkit-fill-available')],
  ['inset top', () => measure('env(safe-area-inset-top)')],
  ['inset bottom', () => measure('env(safe-area-inset-bottom)')],
  ['standalone', () => String((window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches)],
  ['devicePixelRatio', () => String(window.devicePixelRatio)],
];

function measure(value: string): string {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${value};visibility:hidden`;
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  el.remove();
  return h ? String(Math.round(h)) : '—';
}

export default function Diag() {
  const [data, setData] = useState<[string, string][]>([]);
  useEffect(() => {
    const read = () => setData(rows.map(([k, f]) => [k, (() => { try { return f(); } catch { return 'err'; } })()]));
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  return (
    <div className="min-h-full bg-bg p-5 text-fg" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}>
      <h1 className="font-display text-xl font-semibold">Diagnóstico de pantalla</h1>
      <p className="mt-1 text-sm text-muted">Mándale esta captura a quien te ayuda con el desarrollo.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        {data.map(([k, v], i) => (
          <div key={k} className={`flex justify-between px-3 py-2 text-sm ${i > 0 ? 'border-t border-border' : ''}`}>
            <span className="text-muted">{k}</span>
            <span className="tabular font-medium">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-subtle">
        Debajo hay una línea roja en el final exacto del documento. Si queda negro por debajo de la línea,
        el documento es más corto que la pantalla.
      </p>
      <div className="mt-3 h-1 w-full bg-red-500" />

      <p className="mt-6 text-xs text-subtle">
        El marco rosado es el borde exacto de la ventana web (position: fixed, inset: 0). Si el marco no
        llega al borde de la pantalla, el problema no es el CSS: la vista web no ocupa todo el teléfono.
      </p>
      <ViewportFrame />
    </div>
  );
}

/**
 * The decisive picture. This is `fixed inset-0` — the browser's own idea of the
 * viewport, untouched by any of the app's sizing. Screenshot it: if the magenta
 * frame stops above the home indicator, the web view itself is smaller than the
 * screen and no stylesheet can reach those pixels; it has to be fixed in the
 * native shell. If the frame runs to the edge of the phone, the viewport is
 * fine and anything sitting short of it is ours to fix.
 */
function ViewportFrame() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] border-2 border-fuchsia-500">
      <span className="absolute left-1 top-1 bg-fuchsia-500 px-1 text-[10px] font-bold text-white">top: 0</span>
      <span className="absolute bottom-1 left-1 bg-fuchsia-500 px-1 text-[10px] font-bold text-white">bottom: 0</span>
      {/* Where the safe-area inset says the home indicator starts. If the frame
          is right, this band sits exactly over it. */}
      <div className="absolute inset-x-0 bottom-0 bg-fuchsia-500/30" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  );
}
