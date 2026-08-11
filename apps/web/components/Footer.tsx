import Link from 'next/link';
import { REGISTER_URL, FOOTER_SECTIONS, SUPPORT_EMAIL } from '@/lib/site';
import { Container, Button } from './ui';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-tint">
      <Container className="py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              El sistema operativo de tu negocio dentro de WhatsApp. Vende, responde y cobra sin salir del chat.
            </p>
            <div className="mt-5">
              <Button href={REGISTER_URL} external size="sm">Empezar</Button>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-5 inline-block text-sm text-muted transition-colors hover:text-fg"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-fg">{section.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-sm text-subtle sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} WABOS. Todos los derechos reservados.</p>
          <div className="flex items-center gap-5">
            <Link href="/legal/privacidad" className="hover:text-fg">Privacidad</Link>
            <Link href="/legal/terminos" className="hover:text-fg">Términos</Link>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-wa" /> Hecho en Perú
            </span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
