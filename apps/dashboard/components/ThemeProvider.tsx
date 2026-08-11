'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  applyTheme, getPref, getResolvedTheme, resolve, setPref as persist,
  THEME_KEY, type Resolved, type ThemePref,
} from '@/lib/theme';
import { applyNativeStatusBar } from '@/lib/native';

interface ThemeCtxValue {
  pref: ThemePref;
  resolved: Resolved;
  setPref: (p: ThemePref) => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({ pref: 'system', resolved: 'light', setPref: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at the SSR-safe default. The class on <html> is already correct by
  // this point (ThemeScript ran before paint) — this only teaches React what's
  // on screen, so there's never a flash from this state settling.
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<Resolved>('light');

  useEffect(() => {
    const p = getPref();
    setPrefState(p);
    setResolved(resolve(p));
    applyNativeStatusBar(getResolvedTheme());
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    const r = resolve(p);
    persist(p);
    setPrefState(p);
    setResolved(r);
    applyTheme(r);
    applyNativeStatusBar(r);
  }, []);

  // OS appearance changes, while on "Automático". Reads getPref() inside the
  // handler rather than closing over `pref`, so the listener attaches once.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getPref() !== 'system') return;
      const r: Resolved = mql.matches ? 'dark' : 'light';
      setResolved(r);
      applyTheme(r);
      applyNativeStatusBar(r);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Another tab changed the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const p = getPref();
      setPrefState(p);
      setResolved(resolve(p));
      applyTheme(resolve(p));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // An installed iOS PWA resumed after an OS appearance change fires neither
  // matchMedia nor storage reliably, so re-resolve when it becomes visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const r = getResolvedTheme();
      setResolved(r);
      applyTheme(r);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <ThemeCtx.Provider value={{ pref, resolved, setPref }}>
      {children}
    </ThemeCtx.Provider>
  );
}
