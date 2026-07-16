import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Modal';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WABOS — WhatsApp Business OS',
  description: 'Maneja tu negocio sin salir de WhatsApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="grain">
        <Toaster>
          <ConfirmProvider>{children}</ConfirmProvider>
        </Toaster>
      </body>
    </html>
  );
}
