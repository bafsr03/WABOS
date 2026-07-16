/** Where the logged-in dashboard lives. Override with NEXT_PUBLIC_APP_URL in prod. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const LOGIN_URL = `${APP_URL}/login`;

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
      { href: '/features#cobros', label: 'Cobros' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { href: '/features#inbox', label: 'Inbox' },
      { href: '/features#campanas', label: 'Campañas' },
      { href: '/features#crm', label: 'CRM' },
      { href: '/features#catalogo', label: 'Catálogo' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { href: '/about', label: 'Nosotros' },
      { href: '/about#contacto', label: 'Contacto' },
      { href: '/about#demo', label: 'Solicitar demo' },
    ],
  },
] as const;
