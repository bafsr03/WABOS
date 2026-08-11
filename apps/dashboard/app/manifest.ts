import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WABOS — WhatsApp Business OS',
    short_name: 'WABOS',
    description: 'Maneja tu negocio sin salir de WhatsApp',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Splash screen only, and baked in at install time — a PWA manifest can't
    // vary at runtime. Brand indigo rather than white so dark-mode users get a
    // branded flash instead of a white one before first paint.
    background_color: '#5b4bff',
    theme_color: '#5b4bff',
    lang: 'es',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
