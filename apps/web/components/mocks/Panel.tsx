import type { LucideIcon } from 'lucide-react';

export interface PanelRow {
  icon: LucideIcon;
  primary: string;
  secondary?: string;
  tag?: string;
}

/**
 * Generic "slice of the product UI" card, used wherever a full mock would be
 * overkill. Promoted out of app/features/page.tsx so every page can reuse it.
 */
export function Panel({ title, rows, className }: { title: string; rows: PanelRow[]; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] ${className ?? ''}`}>
      <div className="border-b border-border bg-surface-2 px-4 py-3 text-xs font-medium text-muted">{title}</div>
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.primary} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{r.primary}</span>
                {r.secondary && <span className="block truncate text-xs text-muted">{r.secondary}</span>}
              </span>
              {r.tag && (
                <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                  {r.tag}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
