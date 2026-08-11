import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { RevealStagger, RevealItem } from '../Reveal';
import { SpotlightCard } from '../motion/SpotlightCard';

export interface Feature { icon: LucideIcon; title: string; desc: string; href?: string }

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <RevealStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => {
        const Icon = f.icon;
        const card = (
          <SpotlightCard className="card group h-full p-6 transition-colors hover:border-border-strong">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
              <Icon size={20} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
            {f.href && (
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-glow">
                Ver más <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </SpotlightCard>
        );
        return (
          <RevealItem key={f.title} className="h-full">
            {f.href ? <Link href={f.href} className="block h-full">{card}</Link> : card}
          </RevealItem>
        );
      })}
    </RevealStagger>
  );
}
