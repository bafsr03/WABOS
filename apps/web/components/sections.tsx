import Link from 'next/link';
import { ArrowRight, Check, Link2, Bot, BadgeCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LOGIN_URL } from '@/lib/site';
import { Container, SectionHeading, Button, Pill } from './ui';
import { Reveal } from './Reveal';

/* ---------------- Logo / trust cloud ---------------- */
export function LogoCloud() {
  const brands = ['Minimarket Perú', 'Boutique Lima', 'Tech Store', 'Delivery Express', 'Café Central', 'Studio 21'];
  return (
    <Container className="py-10">
      <p className="text-center text-sm text-subtle">Negocios que ya venden mejor con WABOS</p>
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 opacity-70 sm:grid-cols-3 lg:grid-cols-6">
        {brands.map((b) => (
          <div key={b} className="text-center text-sm font-semibold tracking-tight text-muted">{b}</div>
        ))}
      </div>
    </Container>
  );
}

/* ---------------- Feature grid ---------------- */
export interface Feature { icon: LucideIcon; title: string; desc: string; href?: string }

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f, i) => {
        const Icon = f.icon;
        const card = (
          <div className="group h-full rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] transition-all hover:border-border-strong hover:shadow-[var(--shadow-lg)]">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
              <Icon size={20} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
            {f.href && (
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
                Ver más <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </div>
        );
        return (
          <Reveal key={f.title} delay={i * 0.05} className="h-full">
            {f.href ? <Link href={f.href} className="block h-full">{card}</Link> : card}
          </Reveal>
        );
      })}
    </div>
  );
}

/* ---------------- How it works ---------------- */
const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Link2, title: 'Conecta', desc: 'Escanea un QR desde WhatsApp → Dispositivos vinculados. En 30 segundos tu número está enlazado. Cero apps que instalar para tus clientes.' },
  { icon: Bot, title: 'Automatiza', desc: 'El Empleado IA responde con tu perfil de negocio, tus FAQs y tu catálogo. Tú tomas el control de cualquier chat cuando quieras.' },
  { icon: BadgeCheck, title: 'Cobra y verifica', desc: 'Genera cobros, recibe comprobantes y WABOS verifica el pago contra tu banco antes de confirmar. Adiós capturas falsas.' },
];

export function HowItWorks() {
  return (
    <Container className="py-20 lg:py-28">
      <Reveal><SectionHeading center eyebrow="Cómo funciona" title="De WhatsApp a máquina de ventas en tres pasos" /></Reveal>
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.title} delay={i * 0.08}>
              <div className="relative rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
                <span className="tabular absolute right-5 top-5 text-sm font-semibold text-subtle">0{i + 1}</span>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white"><Icon size={20} /></div>
                <h3 className="mt-4 text-lg font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Container>
  );
}

/* ---------------- Feature spotlight (alternating) ---------------- */
export function FeatureSpotlight({
  id, eyebrow, title, desc, bullets, media, reverse,
}: {
  id?: string; eyebrow: string; title: string; desc: string; bullets: string[]; media: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div id={id} className="scroll-mt-24 py-16 lg:py-20">
      <Container>
        <div className={cn('grid items-center gap-10 lg:grid-cols-2 lg:gap-16')}>
          <Reveal className={cn(reverse && 'lg:order-2')}>
            <SectionHeading eyebrow={eyebrow} title={title} subtitle={desc} />
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-fg">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Check size={13} /></span>
                  <span className="text-muted">{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className={cn(reverse && 'lg:order-1')}>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-3xl bg-brand/5 blur-2xl" />
              {media}
            </div>
          </Reveal>
        </div>
      </Container>
    </div>
  );
}

/* ---------------- Stats ---------------- */
export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <Container className="py-16">
      <div className="grid gap-6 rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4 lg:p-10">
        {items.map((s) => (
          <div key={s.label} className="text-center">
            <div className="tabular text-4xl font-semibold tracking-tight text-fg">{s.value}</div>
            <div className="mt-1.5 text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </Container>
  );
}

/* ---------------- FAQ ---------------- */
export function FAQ({ items, title = 'Preguntas frecuentes' }: { items: { q: string; a: string }[]; title?: string }) {
  return (
    <Container className="py-20 lg:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal><SectionHeading eyebrow="FAQ" title={title} /></Reveal>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          {items.map((it) => (
            <details key={it.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-fg">
                {it.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Container>
  );
}

/* ---------------- CTA band ---------------- */
export function CTASection({
  title = 'Empieza a vender mejor desde hoy',
  subtitle = 'Conecta tu WhatsApp en minutos. Sin tarjeta, sin apps para tus clientes.',
}: { title?: string; subtitle?: string }) {
  return (
    <Container className="py-16 lg:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-fg px-6 py-14 text-center sm:px-10 lg:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-90" style={{ background: 'radial-gradient(60% 90% at 50% 0%, color-mix(in oklab, #5b4bff 55%, transparent), transparent 70%)' }} />
        <div className="relative">
          <Pill className="border-white/15 bg-white/10 text-white/80">Prueba gratuita</Pill>
          <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-white/70">{subtitle}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href={LOGIN_URL} external size="lg" className="bg-[#5b4bff] text-fg hover:bg-white/90">
              Empezar gratis <ArrowRight size={16} />
            </Button>
            <Button href="/pricing" size="lg" variant="ghost" className="text-white hover:bg-white/10">Ver precios</Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
