import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Modal';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import NativeBridge from '@/components/NativeBridge';
import OrientationLock from '@/components/OrientationLock';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeScript } from '@/components/ThemeScript';

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
  // Keyed to the OS preference so it's right before JS runs; ThemeProvider
  // overrides it at runtime when the user picks a theme explicitly.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5b4bff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1119' },
  ],
  viewportFit: 'cover', // so env(safe-area-inset-*) has real values on notched iPhones
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required: ThemeScript mutates <html>'s class
    // and style before React hydrates.
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="grain">
        <ThemeProvider>
          <Toaster>
            <ConfirmProvider>{children}</ConfirmProvider>
          </Toaster>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <NativeBridge />
        <OrientationLock />
      </body>
    </html>
  );
}
