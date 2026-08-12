'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/* ---------------- Card ---------------- */
export function Card({ className, glass, ...props }: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border',
        glass ? 'glass' : 'border-border bg-surface shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function SectionCard({ title, desc, children, actions, className }: {
  title?: string; desc?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={cn('p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-fg">{title}</h3>}
            {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}

/* ---------------- StatCard ---------------- */
export function StatCard({ label, value, sub, icon, accent = 'brand', chart }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode;
  accent?: 'brand' | 'accent' | 'warn' | 'danger'; chart?: React.ReactNode;
}) {
  const ring = {
    brand: 'text-brand', accent: 'text-accent', warn: 'text-warn', danger: 'text-danger',
  }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</span>
        {icon && <span className={cn('opacity-70 transition group-hover:opacity-100', ring)}>{icon}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="tabular text-3xl font-semibold leading-none text-fg">{value}</div>
          {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
        </div>
        {chart && <div className="h-10 w-24 shrink-0 opacity-90">{chart}</div>}
      </div>
    </motion.div>
  );
}

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';
    const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' }[size];
    const variants = {
      primary: 'bg-brand text-white shadow-[var(--shadow-card)] hover:bg-brand-strong',
      secondary: 'border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
      ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
      danger: 'bg-danger/10 text-danger hover:bg-danger/16',
    }[variant];
    return <button ref={ref} className={cn(base, sizes, variants, className)} {...props} />;
  },
);
Button.displayName = 'Button';

/* ---------------- Badge / StatusPill ---------------- */
type Tone = 'brand' | 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';
const TONES: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  success: 'bg-success/10 text-success',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  accent: 'bg-accent/10 text-accent',
  neutral: 'bg-surface-3 text-muted',
};
export function Badge({ tone = 'neutral', className, dot, children }: {
  tone?: Tone; className?: string; dot?: boolean; children: React.ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------------- StatusDot ---------------- */
export function StatusDot({ tone = 'neutral', pulse }: { tone?: 'success' | 'warn' | 'danger' | 'neutral'; pulse?: boolean }) {
  const c = { success: 'bg-wa', warn: 'bg-warn', danger: 'bg-danger', neutral: 'bg-subtle' }[tone];
  return <span className={cn('inline-block h-2 w-2 rounded-full', c, pulse && 'pulse-ring')} />;
}

/* ---------------- Inputs ---------------- */
const field = 'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle transition focus:border-brand/50 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--ring)]';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, 'resize-y', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    // Chevron comes from the .select-chevron utility in globals.css rather than
    // an inline data-URI, so its colour can follow the theme.
    <select ref={ref} className={cn(field, 'select-chevron cursor-pointer appearance-none bg-[length:1rem] pr-9', className)}
      {...props}>{children}</select>
  ),
);
Select.displayName = 'Select';

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-subtle">{hint}</span>}
      {children}
    </label>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6.5 w-11 shrink-0 rounded-full transition-colors', checked ? 'brand-gradient' : 'bg-surface-3')}
      style={{ height: '1.6rem' }}
    >
      <motion.span
        layout transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        // --knob rather than white: pure white is a hot spot against the dark
        // off-track, and this keeps one value for both themes.
        className={cn('absolute top-1 h-[1.1rem] w-[1.1rem] rounded-full bg-knob shadow', checked ? 'left-[1.45rem]' : 'left-1')}
      />
    </button>
  );
}

/* ---------------- Spinner ---------------- */
export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-brand', className)} />;
}

/* ---------------- PageHeader ---------------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- PageBody ---------------- */
/**
 * The standard page container: centered, capped, padded — and, unlike the bare
 * div every page used to write by hand, *tall*. A page whose content ran short
 * simply stopped, leaving the bottom of the phone blank, which read as a
 * rendering fault rather than as an empty page.
 *
 * min-h-full resolves against <main> in Shell, whose own bottom padding keeps
 * the floating nav bar out of the way — so "full" already means "as tall as the
 * part of the screen the bar doesn't cover", which is where a page should stop.
 *
 * The last block on the page absorbs the slack (see `.page-fill` in globals.css)
 * — that's the list or card the page ends with, which is exactly the thing that
 * should reach the bottom. A page that shouldn't stretch puts `grow-0` on its
 * last child. Phones only: on a desktop a settings card pulled to 900px tall
 * would be worse than the gap it fixes.
 */
export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('page-fill mx-auto flex min-h-full w-full flex-col', className)}>{children}</div>;
}

/* ---------------- EmptyState ---------------- */
/**
 * `tall` is for the case where the empty state *is* the page — an account with
 * no contacts, no cobros, no campañas. At the default height it sat squashed
 * under the header with the rest of the phone screen left blank; this gives it
 * enough of the viewport to look like the page's content rather than a leftover.
 * Empty states nested inside a section keep the compact default.
 */
export function EmptyState({ icon, title, desc, action, tall }: { icon?: React.ReactNode; title: string; desc?: string; action?: React.ReactNode; tall?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center',
      // Just a floor. The real filling is done by PageBody handing this block
      // the leftover height; a taller minimum only forced pages to scroll by a
      // few dozen pixels for nothing.
      tall && 'min-h-56')}>
      {icon && <div className="text-subtle">{icon}</div>}
      <div>
        <p className="font-medium text-fg">{title}</p>
        {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface-3 text-xs font-semibold text-muted', className)}>
      {initials}
    </span>
  );
}
