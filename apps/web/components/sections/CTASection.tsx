import { ArrowRight } from 'lucide-react';
import { REGISTER_URL } from '@/lib/site';
import { Container, Button, Pill } from '../ui';

export function CTASection({
  title = 'Empieza a vender mejor desde hoy',
  subtitle = 'Conecta tu WhatsApp en minutos. Sin tarjeta, y sin apps que instalar para tus clientes.',
}: { title?: string; subtitle?: string }) {
  return (
    <Container className="py-16 lg:py-24">
      <div className="glow-border noise relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-14 text-center sm:px-10 lg:py-20">
        <div aria-hidden className="aurora pointer-events-none opacity-70"><i /></div>
        <div className="relative">
          <Pill className="border-white/15 bg-white/10 text-fg/80">Sin tarjeta</Pill>
          <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted">{subtitle}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Was `bg-[#5b4bff] text-fg` — dark text on indigo inside a dark
                band, effectively invisible. Now the standard primary button. */}
            <Button href={REGISTER_URL} external size="xl">
              Empezar ahora <ArrowRight size={16} />
            </Button>
            <Button href="/pricing" size="xl" variant="secondary">Ver precios</Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
