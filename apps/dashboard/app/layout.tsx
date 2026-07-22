import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Modal';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import NativeBridge from '@/components/NativeBridge';
import OrientationLock from '@/components/OrientationLock';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WABOS — WhatsApp Business OS',
  description: 'Maneja tu negocio sin salir de WhatsApp',
  applicationName: 'WABOS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'WABOS',
    // 'default' = dark, legible clock over the light frosted header. Content still
    // bleeds under the status bar (viewport-fit: cover), and the header pads itself
    // with env(safe-area-inset-top) so the title clears the clock. See Shell.tsx.
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/192.png',
    apple: '/icons/180.png',
  },
  other: {
    // Next's appleWebApp.capable only emits the generic `mobile-web-app-capable`;
    // iOS Safari still needs the legacy apple- tag to launch standalone (no chrome).
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#5b4bff',
  viewportFit: 'cover', // so env(safe-area-inset-*) has real values on notched iPhones
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="grain">
        <Toaster>
          <ConfirmProvider>{children}</ConfirmProvider>
        </Toaster>
        <ServiceWorkerRegister />
        <NativeBridge />
        <OrientationLock />
      </body>
    </html>
  );
}
