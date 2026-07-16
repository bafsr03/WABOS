import { cn } from '@/lib/cn';

export default function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">W</span>
      <span className={cn('text-xl font-semibold tracking-tight', dark ? 'text-white' : 'text-fg')}>
        WAB<span className="text-brand">OS</span>
      </span>
    </span>
  );
}
