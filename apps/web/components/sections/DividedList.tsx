import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface DividedItem {
  title: string;
  desc: string;
  /** Defaults to the shared bullet icon passed on the list. */
  icon?: LucideIcon;
}

type Tone = 'neutral' | 'danger' | 'warn';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-subtle',
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/10 text-warn',
};

/**
 * A bordered card split into rows by hairlines. The landing problem list, the
 * /features reason codes and /about all share this one
 * format — it's the site's main alternative to a grid of cards, and having it
 * in one place is what stops those sections drifting back into looking alike.
 */
export function DividedList({
  items, icon: SharedIcon, tone = 'neutral', className,
}: {
  items: DividedItem[];
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface', className)}>
      {items.map((it) => {
        const Icon = it.icon ?? SharedIcon;
        return (
          <div key={it.title} className="flex items-start gap-4 px-6 py-5">
            {Icon && (
              <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', TONE[tone])}>
                <Icon size={13} />
              </span>
            )}
            <div>
              <h3 className="text-sm font-semibold text-fg">{it.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{it.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
