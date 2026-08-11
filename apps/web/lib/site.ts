/** Where the logged-in dashboard lives. Override with NEXT_PUBLIC_APP_URL in prod. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const LOGIN_URL = `${APP_URL}/login`;
export const REGISTER_URL = `${APP_URL}/register`;

/** This marketing site's own origin — canonicals, sitemap, robots, JSON-LD. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wabos.co').replace(/\/$/, '');

export const SUPPORT_EMAIL = 'support@wabos.co';

export const NAV_LINKS = [
  { href: '/features', label: 'Producto' },
  { href: '/pricing', label: 'Precios' },
  { href: '/about', label: 'Nosotros' },
] as const;

export const FOOTER_SECTIONS = [
  {
    title: 'Producto',
    links: [
      { href: '/features', label: 'Funciones' },
      { href: '/pricing', label: 'Precios' },
      { href: '/features#inbox', label: 'Inbox' },
      { href: '/features#ia', label: 'Empleado IA' },
      { href: '/features#cobros', label: 'Cobros verificados' },
    ],
  },
  {
    title: 'Capacidades',
    links: [
      { href: '/features#pos', label: 'Punto de venta' },
      { href: '/features#analitica', label: 'Analítica' },
      { href: '/features#catalogo', label: 'Catálogo' },
      { href: '/features#crm', label: 'CRM' },
      { href: '/features#campanas', label: 'Campañas' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { href: '/about', label: 'Nosotros' },
      { href: '/contacto', label: 'Contacto' },
      { href: '/legal/privacidad', label: 'Privacidad' },
      { href: '/legal/terminos', label: 'Términos' },
    ],
  },
] as const;
