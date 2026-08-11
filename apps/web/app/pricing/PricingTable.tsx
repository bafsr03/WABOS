'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { REGISTER_URL } from '@/lib/site';
import { PLANS, annualMonthly, annualTotal, type Plan } from '@/lib/plans';
import { Button } from '@/components/ui';

/**
 * The only client component on this page — it exists purely so the
 * monthly/annual toggle can hold state. Everything else (hero, comparison
 * table, FAQ, CTA) stays server-rendered, which is why /pricing now has real
 * metadata instead of silently inheriting the site default.
 */
export function PricingTable() {
  const [annual, setAnnual] = useState(false);
  const selfServe = PLANS.filter((p) => p.id !== 'enterprise');
  const enterprise = PLANS.find((p) => p.id === 'enterprise')!;

  return (
    <>
      {/* Billing toggle */}
      <div className="mt-10 flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-surface p-1">
          {[
            { key: false, label: 'Mensual' },
            { key: true, label: 'Anual · 2 meses gratis' },
          ].map((o) => (
            <button
              key={String(o.key)}
              type="button"
              onClick={() => setAnnual(o.key)}
              aria-pressed={annual === o.key}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                annual === o.key ? 'bg-brand text-white' : 'text-muted hover:text-fg',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Self-serve tiers */}
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {selfServe.map((p) => (
          <PlanCard key={p.id} plan={p} annual={annual} />
        ))}
      </div>

      {/* Enterprise is quoted, not checked out — so it gets a band, not a card. */}
      <div className="card mt-5 flex flex-col gap-6 p-8 lg:flex-row lg:items-center">
        <div className="lg:flex-1">
          <h3 className="text-lg font-semibold text-fg">{enterprise.name}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {enterprise.blurb} Sin límites de contactos, productos, agentes ni respuestas de IA,
            con infraestructura dedicada y acuerdo de nivel de servicio.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs text-subtle">Desde</span>
            <div className="tabular text-2xl font-semibold text-fg">S/{enterprise.monthly}<span className="text-sm font-normal text-muted">/mes</span></div>
          </div>
          <Button href="/contacto" size="lg" variant="secondary">Hablemos</Button>
        </div>
      </div>
    </>
  );
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const shown = annual ? annualMonthly(plan.monthly) : plan.monthly;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border p-7',
        plan.popular
          ? 'glow-border border-transparent bg-surface shadow-[var(--shadow-glow)]'
          : 'border-border bg-surface shadow-[var(--shadow-card)]',
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">
          Más elegido
        </span>
      )}

      <h3 className="text-base font-semibold text-fg">{plan.name}</h3>
      <p className="mt-1 text-sm text-muted">{plan.blurb}</p>

      <div className="mt-6 flex items-end gap-1.5">
        <span className="tabular text-4xl font-semibold tracking-tight text-fg">S/{shown}</span>
        <span className="pb-1 text-sm text-muted">/mes</span>
      </div>
      <p className="mt-1.5 text-xs text-subtle">
        {annual ? `S/${annualTotal(plan.monthly)} al año · IGV incluido` : 'IGV incluido · sin permanencia'}
      </p>

      <Button href={REGISTER_URL} external size="lg" variant={plan.popular ? 'primary' : 'secondary'} className="mt-6 w-full">
        {plan.cta} <ArrowRight size={15} />
      </Button>

      <ul className="mt-7 space-y-2.5 border-t border-border pt-6">
        <Limit label="contactos" value={plan.contacts} />
        <Limit label={plan.agents === 1 ? 'agente IA' : 'agentes IA'} value={plan.agents} />
        <Limit label="productos" value={plan.products} />
        <Limit label="respuestas IA / mes" value={plan.aiMessages} />
        <Limit label={plan.numbers === 1 ? 'número de WhatsApp' : 'números de WhatsApp'} value={plan.numbers} />
        {plan.extras.map((e) => (
          <li key={e} className="flex items-start gap-2.5 text-sm text-muted">
            <Check size={14} className="mt-0.5 shrink-0 text-success" />
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <Check size={14} className="mt-0.5 shrink-0 text-success" />
      <span>
        <strong className="tabular font-semibold text-fg">
          {value === null ? 'Ilimitados' : value.toLocaleString('es-PE')}
        </strong>{' '}
        {label}
      </span>
    </li>
  );
}
