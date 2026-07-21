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
    background_color: '#ffffff',
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
