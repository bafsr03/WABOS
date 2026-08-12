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
    // 'black-translucent' is the only value that lets the web view own the whole
    // screen. With 'default' iOS letterboxes an installed web app between black
    // bars top and bottom and reports env(safe-area-inset-*) as 0 — which is
    // where the dead strip under every page came from, and why the floating nav
    // bar sat high (it was hugging the bottom of the box, not of the phone).
    // Content now bleeds under the status bar and the home indicator, so Shell
    // pads itself with env(safe-area-inset-top) and the nav bar with
    // env(safe-area-inset-bottom). See Shell.tsx.
    statusBarStyle: 'black-translucent',
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
