import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Container, SectionHeading } from '../ui';
import { Reveal } from '../Reveal';

export function FeatureSpotlight({
  id, eyebrow, title, desc, bullets, media, reverse,
}: {
  id?: string; eyebrow: string; title: string; desc: string; bullets: string[];
  media: React.ReactNode; reverse?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-16 lg:py-20">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal className={cn(reverse && 'lg:order-2')}>
            <SectionHeading eyebrow={eyebrow} title={title} subtitle={desc} />
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-glow">
                    <Check size={13} />
                  </span>
                  <span className="text-muted">{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} blur className={cn(reverse && 'lg:order-1')}>
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-brand/10 blur-3xl" />
              {media}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/** Compact variant for modules that don't warrant a full two-column spotlight. */
export function FeatureRow({
  items,
}: { items: { id?: string; icon: React.ComponentType<{ size?: number }>; title: string; desc: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.title} id={it.id} className="card scroll-mt-24 p-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
              <Icon size={18} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-fg">{it.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.desc}</p>
          </div>
        );
      })}
    </div>
  );
}
