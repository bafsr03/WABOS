import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';
import { Container, Button } from '@/components/ui';

export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 hero-glow" />
      <div className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
      <Container className="flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
        <span className="tabular text-7xl font-semibold tracking-tight text-gradient sm:text-8xl">404</span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Esta página se fue de la conversación</h1>
        <p className="mt-3 max-w-md text-muted">
          El enlace que buscas no existe o cambió de lugar. Volvamos a lo importante: vender por WhatsApp.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/" size="lg"><Home size={16} /> Ir al inicio</Button>
          <Button href="/features" size="lg" variant="secondary"><ArrowLeft size={16} /> Ver el producto</Button>
        </div>
      </Container>
    </section>
  );
}
