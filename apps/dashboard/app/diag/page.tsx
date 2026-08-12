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
  ['document height', () => String(document.documentElement.scrollHeight)],
  ['body height', () => String(Math.round(document.body.getBoundingClientRect().height))],
  ['screen.height', () => String(window.screen.height)],
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
    </div>
  );
}
