'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Temporary instrument for the "the nav bar sits at a different height on some
// pages" report. The bar is one fixed element in Shell, identical on every
// route, so if it really lands elsewhere the cause is the viewport, not the
// markup — and only the device can tell us which. Prints the bar's measured
// rect against every height the phone reports.
//
// Turn on with ?nav=debug (sticks across navigation), off with ?nav=off.
// Screenshot the panel on two pages that disagree.

const FLAG = 'nav_debug';

export default function NavDebug() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<[string, string][]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('nav');
    if (q === 'debug') localStorage.setItem(FLAG, '1');
    if (q === 'off') localStorage.removeItem(FLAG);
    setOn(localStorage.getItem(FLAG) === '1');
  }, [pathname]);

  useEffect(() => {
    if (!on) return;
    const read = () => {
      const bar = document.querySelector('[data-nav-bar]');
      const r = bar?.getBoundingClientRect();
      const pill = bar?.querySelector('nav')?.getBoundingClientRect();
      const shell = document.querySelector('[data-shell]')?.getBoundingClientRect();
      const cs = getComputedStyle(document.documentElement);
      const de = document.documentElement;
      const vv = window.visualViewport;
      setRows([
        ['route', pathname],
        // The one that broke everything: if the shell box isn't the window, the
        // bar can't be either. It must equal innerHeight on every route.
        ['shell h (want innerH)', shell ? String(Math.round(shell.height)) : '—'],
        ['--app-h', cs.getPropertyValue('--app-h').trim() || 'UNSET'],
        // The number that matters: how far the pill's bottom edge is from the
        // bottom of the window. If this differs between two pages, the bar is
        // being laid out against different viewports, not different CSS.
        ['pill→bottom gap', pill ? String(Math.round(window.innerHeight - pill.bottom)) : 'no bar'],
        ['bar rect top/bottom', r ? `${Math.round(r.top)} / ${Math.round(r.bottom)}` : '—'],
        ['pill rect top/bottom', pill ? `${Math.round(pill.top)} / ${Math.round(pill.bottom)}` : '—'],
        ['innerHeight', String(window.innerHeight)],
        ['visualViewport h/offY', vv ? `${Math.round(vv.height)} / ${Math.round(vv.offsetTop)}` : 'n/a'],
        ['doc scrollH/clientH/top', `${de.scrollHeight} / ${de.clientHeight} / ${Math.round(de.scrollTop)}`],
        ['body rect top/height', `${Math.round(document.body.getBoundingClientRect().top)} / ${Math.round(document.body.getBoundingClientRect().height)}`],
        ['--nav-inset', cs.getPropertyValue('--nav-inset').trim() || '—'],
        ['--nav-clearance', cs.getPropertyValue('--nav-clearance').trim() || '—'],
        ['inset bottom (px)', probe('env(safe-area-inset-bottom)')],
        ['inset top (px)', probe('env(safe-area-inset-top)')],
      ]);
    };
    read();
    // The bar can settle a frame late (fonts, the layout animation on the
    // active tab), so re-read after paint as well as on every viewport event.
    const raf = requestAnimationFrame(read);
    const t = setTimeout(read, 600);
    window.addEventListener('resize', read);
    window.addEventListener('scroll', read, true);
    window.visualViewport?.addEventListener('resize', read);
    window.visualViewport?.addEventListener('scroll', read);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', read);
      window.removeEventListener('scroll', read, true);
      window.visualViewport?.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('scroll', read);
    };
  }, [on, pathname]);

  if (!on) return null;

  return (
    <div className="pointer-events-none fixed inset-x-2 z-[60] rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-tight text-white"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="opacity-60">{k}</span>
          <span className="font-semibold">{v}</span>
        </div>
      ))}
    </div>
  );
}

function probe(value: string): string {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${value};visibility:hidden`;
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  el.remove();
  return String(Math.round(h));
}
