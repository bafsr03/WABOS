import { Bot, User } from 'lucide-react';

const THREADS = [
  { name: 'Ana Torres', last: '¿Tienen delivery a Surco?', time: '9:41', unread: 2, mode: 'ia' as const },
  { name: 'Carlos R.', last: 'Perfecto, ahí te yapeo', time: '9:38', unread: 0, mode: 'ia' as const },
  { name: 'Mayorista JB', last: 'Necesito factura a nombre de…', time: '9:12', unread: 1, mode: 'humano' as const },
  { name: 'Lucía P.', last: '¿A cuánto el pack de 6?', time: '8:57', unread: 0, mode: 'ia' as const },
];

/** Conversation list with the per-chat IA/humano switch — the real inbox model. */
export function InboxMock({ className }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
        <span className="text-xs font-medium text-muted">Inbox</span>
        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand-glow">3 sin leer</span>
      </div>
      <div className="divide-y divide-border">
        {THREADS.map((t) => (
          <div key={t.name} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted">
              {t.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-subtle">{t.time}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-xs text-muted">{t.last}</span>
                {t.unread > 0 && (
                  <span className="ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-wa px-1 text-[9px] font-bold text-[#04120a]">
                    {t.unread}
                  </span>
                )}
              </span>
            </span>
            <span
              className={
                t.mode === 'ia'
                  ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand-glow'
                  : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted'
              }
            >
              {t.mode === 'ia' ? <><Bot size={10} /> IA</> : <><User size={10} /> Tú</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
