import Link from 'next/link';
import { cn } from '@/lib/cn';

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/* ---------------- Button (renders <a>/<Link> or <button>) ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SIZE: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};
const BTN_VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-[var(--shadow-card)] hover:bg-brand-strong',
  secondary: 'border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
};

export function btnClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], className);
}

export function Button({
  href, variant = 'primary', size = 'md', className, children, external, ...rest
}: {
  href?: string; variant?: Variant; size?: Size; className?: string; external?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = btnClass(variant, size, className);
  if (href) {
    if (external || href.startsWith('http')) {
      return <a href={href} className={cls} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>;
    }
    return <Link href={href} className={cls}>{children}</Link>;
  }
  return <button className={cls} {...rest}>{children}</button>;
}

/* ---------------- Badge / pill ---------------- */
export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted', className)}>
      {children}
    </span>
  );
}

/* ---------------- Eyebrow ---------------- */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold uppercase tracking-wider text-brand">{children}</span>;
}

/* ---------------- SectionHeading ---------------- */
export function SectionHeading({
  eyebrow, title, subtitle, center, className,
}: {
  eyebrow?: string; title: React.ReactNode; subtitle?: React.ReactNode; center?: boolean; className?: string;
}) {
  return (
    <div className={cn(center && 'mx-auto text-center', 'max-w-2xl', className)}>
      {eyebrow && <div className="mb-3"><Eyebrow>{eyebrow}</Eyebrow></div>}
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}
