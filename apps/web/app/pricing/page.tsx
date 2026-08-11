import { Check, Minus, AlertCircle } from 'lucide-react';
import { buildMetadata, graph, pricingProductSchema, faqSchema, breadcrumbSchema } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { PRICING_FAQS } from '@/lib/faqs';
import { PLANS, COMPARE_LIMITS, COMPARE_GATED, INCLUDED_EVERYWHERE } from '@/lib/plans';
import { Container, SectionHeading, Pill } from '@/components/ui';
import { Reveal } from '@/components/Reveal';
import { FAQ, CTASection } from '@/components/sections';
import { PricingTable } from './PricingTable';

export const metadata = buildMetadata({
  title: 'Precios',
  description: 'Planes de WABOS desde S/49 al mes, en soles e IGV incluido. Los planes cambian el volumen, no las funciones. Sin permanencia, cancela cuando quieras.',
  path: '/pricing',
});

export default function PricingPage() {
  return (
    <>
      <JsonLd data={graph(
        pricingProductSchema(),
        faqSchema(PRICING_FAQS),
        breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Precios', path: '/pricing' }]),
      )} />

      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />
        <Container className="py-20 lg:py-24">
          <Reveal>
            <div className="text-center">
              <Pill><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Precios simples</Pill>
              <SectionHeading
                as="h1"
                center
                className="mt-6"
                title="Un plan para cada etapa de tu negocio"
                subtitle="En soles, IGV incluido y sin permanencia. Lo que cambia entre planes es el volumen — las funciones están todas incluidas siempre."
              />
            </div>
          </Reveal>

          <PricingTable />

          <p className="mt-8 text-center text-sm text-subtle">
            ¿Solo quieres probarlo? Al registrarte no se te pide tarjeta: entras a un espacio gratuito con
            límites reducidos para usarlo con clientes reales antes de elegir plan.
          </p>
        </Container>
      </section>

      {/* ---------------- Comparison ---------------- */}
      <Container className="py-16 lg:py-20">
        <Reveal>
          <SectionHeading center eyebrow="Compara" title="Qué incluye cada plan" />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border p-4 text-left font-medium text-muted">Límite</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="border-b border-border p-4 text-left font-semibold text-fg">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_LIMITS.map((row) => (
                  <tr key={row.label}>
                    <td className="border-b border-border p-4 text-muted">{row.label}</td>
                    {PLANS.map((p) => (
                      <td key={p.id} className="tabular border-b border-border p-4 font-medium text-fg">
                        {row.get(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                {COMPARE_GATED.map((row) => (
                  <tr key={row.label}>
                    <td className="border-b border-border p-4 text-muted">{row.label}</td>
                    {PLANS.map((p) => (
                      <td key={p.id} className="border-b border-border p-4">
                        {row.get(p)
                          ? <Check size={16} className="text-success" aria-label="Incluido" />
                          : <Minus size={16} className="text-subtle" aria-label="No incluido" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="card mt-8 p-7">
            <h3 className="text-sm font-semibold text-fg">Incluido en todos los planes, sin excepción</h3>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {INCLUDED_EVERYWHERE.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-muted">
                  <Check size={14} className="mt-0.5 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* Limit behaviour — the honest version of "what happens if I go over". */}
        <Reveal delay={0.2}>
          <div className="mt-5 flex items-start gap-4 rounded-2xl border border-warn/25 bg-warn/[0.06] p-6">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <h3 className="text-sm font-semibold text-fg">¿Y si me paso del límite?</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Si llegas al tope de respuestas de IA del mes, la IA deja de contestar automáticamente hasta
                el mes siguiente — pero tu inbox, tus cobros, tu punto de venta y todo lo demás siguen
                funcionando con normalidad. Verás el aviso en el panel y puedes subir de plan para
                reactivarla al instante. Con los contactos, productos y agentes es igual de simple: al llegar
                al tope, el sistema te avisa en vez de cobrarte de más sin preguntar.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>

      <FAQ items={PRICING_FAQS} title="Preguntas sobre precios" />
      <CTASection
        title="Empieza con el plan que te queda"
        subtitle="Pruébalo sin tarjeta. Subes o bajas de plan cuando lo necesites, con el cobro prorrateado."
      />
    </>
  );
}
