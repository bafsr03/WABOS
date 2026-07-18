'use client';

import { useState } from 'react';
import { Check, Minus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LOGIN_URL } from '@/lib/site';
import { Container, Button, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { FAQ, CTASection } from '@/components/sections';

interface Tier {
  name: string; monthly: number | null; from?: boolean; blurb: string; popular?: boolean;
  features: string[]; cta: string;
}
const TIERS: Tier[] = [
  { name: 'Básico', monthly: 49, blurb: 'Para empezar a atender mejor.', cta: 'Empezar',
    features: ['1 número de WhatsApp', '1 usuario', 'Empleado IA: Soporte', 'Inbox + CRM + FAQ bot', 'Captura de leads', '1,000 mensajes IA / mes'] },
  { name: 'Avanzado', monthly: 89, popular: true, blurb: 'El favorito de los negocios que venden.', cta: 'Empezar',
    features: ['3 usuarios', 'Catálogo + recomendaciones IA', 'Empleados: Ventas, Soporte, Recepción', 'Citas + campañas', 'Etiquetas + historial 1 año', '3,000 mensajes IA / mes'] },
  { name: 'Pro', monthly: 159, blurb: 'Para equipos y operaciones serias.', cta: 'Empezar',
    features: ['10 usuarios', 'Inbox multi-agente + CRM avanzado', 'Los 5 Empleados IA', 'Pipelines + reportes', 'Difusiones ilimitadas*', '6,000 mensajes IA / mes'] },
  { name: 'Empresarial', monthly: 399, from: true, blurb: 'Múltiples sucursales, a tu medida.', cta: 'Contactar',
    features: ['Usuarios y números ilimitados', 'Múltiples sucursales', 'IA personalizada + integraciones', 'Infraestructura dedicada + SLA', 'White label', 'Uso justo'] },
];

const COMPARE: { label: string; values: (string | boolean)[] }[] = [
  { label: 'Números de WhatsApp', values: ['1', '1', '1 (+add-on)', 'Ilimitado'] },
  { label: 'Usuarios / agentes', values: ['1', '3', '10', 'Ilimitado'] },
  { label: 'Mensajes IA / mes', values: ['1,000', '3,000', '6,000', 'Uso justo'] },
  { label: 'Difusiones / mes', values: ['500', '3,000', 'Ilimitadas*', 'Ilimitadas'] },
  { label: 'Contactos (CRM)', values: ['1,000', '5,000', '20,000', 'Ilimitado'] },
  { label: 'Productos en catálogo', values: ['50', '500', 'Ilimitado', 'Ilimitado'] },
  { label: 'Empleados IA', values: ['1', '3', '5', 'Personalizados'] },
  { label: 'Cobros verificados', values: [true, true, true, true] },
  { label: 'Historial de conversaciones', values: ['30 días', '1 año', 'Ilimitado', 'Ilimitado'] },
  { label: 'Soporte prioritario', values: [false, false, true, true] },
];

const FAQS = [
  { q: '¿Puedo cambiar de plan cuando quiera?', a: 'Sí, subes o bajas de plan en cualquier momento. Los cambios se prorratean automáticamente.' },
  { q: '¿Qué pasa si supero los mensajes de IA?', a: 'Al llegar al límite del mes, la IA deja de responder automáticamente (tu bandeja e inbox siguen funcionando). Subes de plan para reactivarla al instante, y el conteo se reinicia cada mes.' },
  { q: '¿El precio incluye IGV?', a: 'Sí, todos los precios están en soles (S/) e incluyen IGV.' },
  { q: '¿Hay permanencia?', a: 'No hay contratos de permanencia. El plan mensual se cancela cuando quieras. El anual te da 2 meses gratis.' },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const price = (t: Tier) => {
    if (t.monthly == null) return '—';
    const value = annual ? Math.round(t.monthly * 10 / 12) : t.monthly;
    return `S/${value}`;
  };

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 hero-glow" />
        <Container className="pb-6 pt-16 text-center lg:pt-20">
          <Reveal>
            <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Precios simples</Pill>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Un plan para cada etapa de tu negocio
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Precios en soles, IGV incluido. Sin permanencia. Cancela cuando quieras.</p>
          </Reveal>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {[{ k: false, l: 'Mensual' }, { k: true, l: 'Anual · 2 meses gratis' }].map((o) => (
              <button
                key={String(o.k)}
                onClick={() => setAnnual(o.k)}
                className={cn('rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  annual === o.k ? 'bg-brand text-white' : 'text-muted hover:text-fg')}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Container>
      </section>

      {/* Tier cards */}
      <Container className="pb-8 pt-4">
        <div className="grid gap-5 lg:grid-cols-4">
          {TIERS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.05} className="h-full">
              <div className={cn(
                'flex h-full flex-col rounded-2xl border bg-surface p-6 shadow-[var(--shadow-card)]',
                t.popular ? 'border-brand ring-1 ring-brand' : 'border-border',
              )}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-fg">{t.name}</h3>
                  {t.popular && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">Más popular</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{t.blurb}</p>
                <div className="mt-5 flex items-end gap-1">
                  {t.from && <span className="pb-1 text-sm text-muted">Desde</span>}
                  <span className="tabular text-4xl font-semibold tracking-tight text-fg">{price(t)}</span>
                  <span className="pb-1 text-sm text-muted">/mes</span>
                </div>
                <Button href={t.name === 'Empresarial' ? '/about#contacto' : LOGIN_URL} external={t.name !== 'Empresarial'}
                  variant={t.popular ? 'primary' : 'secondary'} className="mt-5 w-full">
                  {t.cta} {t.name !== 'Empresarial' && <ArrowRight size={15} />}
                </Button>
                <ul className="mt-6 space-y-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-muted">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-subtle">* «Ilimitadas» sujeto a uso justo y al espaciado anti-bloqueo de 6–12 s por mensaje.</p>
      </Container>

      {/* Comparison table */}
      <Container className="py-16 lg:py-20">
        <div className="mb-8 text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-brand">Compara</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg">Todo lo que incluye cada plan</h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-4 text-left font-medium text-muted">Característica</th>
                {TIERS.map((t) => (
                  <th key={t.name} className={cn('px-5 py-4 text-center font-semibold', t.popular ? 'text-brand' : 'text-fg')}>{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPARE.map((row) => (
                <tr key={row.label}>
                  <td className="px-5 py-3.5 font-medium text-fg">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-5 py-3.5 text-center text-muted">
                      {v === true ? <Check size={17} className="mx-auto text-brand" />
                        : v === false ? <Minus size={16} className="mx-auto text-subtle" />
                        : <span className="tabular">{v}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
     
      <CTASection title="Empieza con el plan que te queda" subtitle="Prueba WABOS sin tarjeta. Sube o baja de plan cuando lo necesites." />
     
      <FAQ items={FAQS} title="Preguntas sobre precios" />
    </>
  );
}
