import type { Metadata } from 'next';
import { Inter, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { JsonLd } from '@/components/seo/JsonLd';
import { SITE_URL } from '@/lib/site';
import { graph, organizationSchema, websiteSchema } from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Display face for headings only — body stays on Inter.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display-src',
  display: 'swap',
});

const title = 'WABOS — Convierte tu WhatsApp en tu empleado más inteligente';
const description =
  'WABOS es el sistema operativo de tu negocio dentro de WhatsApp: inbox en tiempo real, un Empleado IA que responde a tus clientes, verificación de comprobantes Yape y Plin, punto de venta y analítica con ganancia real.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: '%s — WABOS',
  },
  description,
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'es_PE',
    siteName: 'WABOS',
    url: '/',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <JsonLd data={graph(organizationSchema(), websiteSchema())} />
        {/* Reveal wrappers ship with opacity:0 and are animated in on scroll.
            Without JS that content would never appear, so pin it visible. */}
        <noscript>
          <style>{'[data-reveal]{opacity:1 !important;transform:none !important;filter:none !important}'}</style>
        </noscript>
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <MotionProvider>
          <Nav />
          <main>{children}</main>
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}
