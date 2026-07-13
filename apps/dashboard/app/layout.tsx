import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WABOS — WhatsApp Business OS',
  description: 'Run your business without leaving WhatsApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
