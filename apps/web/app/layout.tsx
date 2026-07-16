import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const title = 'WABOS — Convierte tu WhatsApp en tu empleado más inteligente';
const description =
  'WABOS es el sistema operativo de tu negocio dentro de WhatsApp: inbox en tiempo real, un Empleado IA que responde a tus clientes, verificación inteligente de pagos, campañas y CRM.';

export const metadata: Metadata = {
  metadataBase: new URL('https://wabos.app'),
  title: {
    default: title,
    template: '%s — WABOS',
  },
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'es_PE',
    siteName: 'WABOS',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
