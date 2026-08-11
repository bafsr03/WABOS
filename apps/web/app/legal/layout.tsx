import { Container } from '@/components/ui';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-20 lg:py-24">
      <div className="prose-dark mx-auto max-w-2xl">{children}</div>
    </Container>
  );
}
