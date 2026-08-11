import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const ROUTES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/features', priority: 0.9 },
  { path: '/pricing', priority: 0.9 },
  { path: '/contacto', priority: 0.6 },
  { path: '/about', priority: 0.5 },
  { path: '/legal/privacidad', priority: 0.3 },
  { path: '/legal/terminos', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: r.priority,
  }));
}
