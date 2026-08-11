import { Container, Button } from '@/components/ui';

export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-10" />
      <Container className="py-28 text-center lg:py-36">
        <div className="text-gradient text-7xl font-semibold tracking-tight sm:text-8xl">404</div>
        <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Esta página se fue de la conversación
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pretty text-muted">
          El enlace que buscas no existe o cambió de lugar. Volvamos a lo importante: vender por WhatsApp.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/" size="lg">Ir al inicio</Button>
          <Button href="/features" size="lg" variant="secondary">Ver el producto</Button>
          <Button href="/contacto" size="lg" variant="ghost">Contacto</Button>
        </div>
      </Container>
    </section>
  );
}
