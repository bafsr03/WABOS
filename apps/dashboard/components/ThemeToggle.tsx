'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from './ThemeProvider';
import type { ThemePref } from '@/lib/theme';

export const THEMES: { v: ThemePref; label: string; Icon: typeof Sun }[] = [
  { v: 'light', label: 'Claro', Icon: Sun },
  { v: 'dark', label: 'Oscuro', Icon: Moon },
  { v: 'system', label: 'Automático', Icon: Monitor },
];

/**
 * Three explicit states rather than a cycling button: cycling hides the current
 * value and makes "Automático" undiscoverable.
 *
 * `compact` renders icon-only for the sidebar footer; the labelled version is
 * used in Ajustes → Apariencia.
 */
export function ThemeToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const { pref, setPref } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1',
        compact && 'flex w-full',
        className,
      )}
    >
      {THEMES.map(({ v, label, Icon }) => {
        const on = pref === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => setPref(v)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg transition',
              compact ? 'h-8 flex-1' : 'px-3.5 py-2 text-sm font-medium',
              on
                ? 'bg-surface text-fg shadow-[var(--shadow-card)]'
                : 'text-muted hover:text-fg',
            )}
          >
            <Icon size={15} className={on ? 'text-brand' : 'text-subtle'} />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
