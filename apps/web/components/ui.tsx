import Link from 'next/link';
import { cn } from '@/lib/cn';

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/* ---------------- Button (renders <a>/<Link> or <button>) ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'wa';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 active:scale-[.98]';
const BTN_SIZE: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  xl: 'px-7 py-3.5 text-base',
};
const BTN_VARIANT: Record<Variant, string> = {
  // On dark, hover goes lighter (--brand-strong is inverted vs the dashboard).
  primary: 'bg-brand text-white hover:bg-brand-strong hover:shadow-[var(--shadow-glow)]',
  secondary: 'border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  wa: 'bg-wa text-[#04120a] font-semibold hover:brightness-110',
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
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted backdrop-blur', className)}>
      {children}
    </span>
  );
}

/* ---------------- Eyebrow ---------------- */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold uppercase tracking-wider text-brand-glow">{children}</span>;
}

/* ---------------- SectionHeading ---------------- */
export function SectionHeading({
  eyebrow, title, subtitle, center, className, as = 'h2',
}: {
  eyebrow?: string; title: React.ReactNode; subtitle?: React.ReactNode; center?: boolean; className?: string;
  as?: 'h1' | 'h2';
}) {
  const Tag = as;
  return (
    <div className={cn(center && 'mx-auto text-center', 'max-w-2xl', className)}>
      {eyebrow && <div className="mb-3"><Eyebrow>{eyebrow}</Eyebrow></div>}
      <Tag className={cn(
        'text-balance font-semibold tracking-tight text-fg',
        as === 'h1' ? 'text-4xl sm:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl',
      )}>{title}</Tag>
      {subtitle && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}
