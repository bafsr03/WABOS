import { cn } from '@/lib/cn';

export default function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="WABOS" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
      <span className={cn('text-xl font-semibold tracking-tight', dark ? 'text-white' : 'text-fg')}>
        WAB<span className="text-brand">OS</span>
      </span>
    </span>
  );
}
