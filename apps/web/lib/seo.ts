import type { Metadata } from 'next';
import { SITE_URL, SUPPORT_EMAIL } from './site';
import { PLANS } from './plans';
import type { Faq } from './faqs';

/**
 * Page metadata. `path` is relative — metadataBase in the root layout resolves
 * it into an absolute canonical/OG url, so no absolute URLs anywhere else.
 */
export function buildMetadata({
  title, description, path,
}: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title, description, url: path, type: 'website', locale: 'es_PE', siteName: 'WABOS',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'WABOS',
    url: SITE_URL,
    email: SUPPORT_EMAIL,
    description: 'El sistema operativo de tu negocio dentro de WhatsApp: inbox, empleado IA, verificación de pagos, punto de venta y analítica.',
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png`, width: 256, height: 256 },
    areaServed: { '@type': 'Country', name: 'PE' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT_EMAIL,
      availableLanguage: ['es'],
    },
  };
}

export function websiteSchema() {
  // Deliberately no SearchAction — there is no site search, and advertising a
  // fake one is a quality signal against you.
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: SITE_URL,
    name: 'WABOS',
    inLanguage: 'es-PE',
    publisher: { '@id': ORG_ID },
  };
}

export function softwareApplicationSchema() {
  const prices = PLANS.map((p) => p.monthly);
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: 'WABOS',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'es-PE',
    publisher: { '@id': ORG_ID },
    // No aggregateRating: there are no reviews, and inventing one risks a
    // manual action.
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'PEN',
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: PLANS.length,
    },
    featureList: [
      'Inbox de WhatsApp en tiempo real',
      'Empleado IA con catálogo y base de conocimiento',
      'Verificación de comprobantes Yape y Plin',
      'Recordatorios de cobro automáticos',
      'Punto de venta y caja',
      'Analítica con ganancia neta',
      'CRM con etiquetas y notas',
      'Campañas segmentadas',
    ],
  };
}

/** Offers mapped from PLANS so structured data can never contradict the page. */
export function pricingProductSchema() {
  return {
    '@type': 'Product',
    '@id': `${SITE_URL}/pricing#product`,
    name: 'WABOS',
    description: 'Planes de WABOS para negocios que venden por WhatsApp.',
    brand: { '@id': ORG_ID },
    offers: PLANS.map((p) => ({
      '@type': 'Offer',
      name: `WABOS ${p.name}`,
      price: String(p.monthly),
      priceCurrency: 'PEN',
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
      ...(p.from ? { description: 'Desde' } : null),
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(p.monthly),
        priceCurrency: 'PEN',
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: 'MON',
      },
    })),
  };
}

export function faqSchema(items: Faq[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/** Wraps one or more schema objects into a single @graph document. */
export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
