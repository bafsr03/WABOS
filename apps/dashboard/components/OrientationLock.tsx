'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

// Keeps the app upright. Two layers, because no single mechanism covers every device:
//  1. Screen Orientation API — actually locks rotation on Android/Chrome PWAs (and
//     Capacitor). Silently unsupported on iOS Safari, which ignores it and the
//     manifest's `orientation` field alike.
//  2. A CSS-driven overlay (below) that blocks the UI on small screens turned to
//     landscape — the only thing that "locks" the experience on iOS.
export default function OrientationLock() {
  useEffect(() => {
    const o: any = window.screen?.orientation;
    o?.lock?.('portrait').catch(() => {}); // best-effort; rejects where unsupported
  }, []);

  return (
    <div className="orientation-lock" aria-hidden>
      <RotateCcw size={30} />
      <p>Gira tu teléfono a vertical</p>
    </div>
  );
}
