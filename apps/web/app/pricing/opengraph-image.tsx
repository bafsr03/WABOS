import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'Precios de WABOS — desde S/49 al mes, IGV incluido';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OG() {
  return renderOg({
    title: 'Un plan para cada etapa de tu negocio',
    subtitle: 'Desde S/49 al mes. En soles, IGV incluido, sin permanencia.',
    footer: 'Básico S/49 · Avanzado S/89 · Pro S/159 · Empresarial desde S/399',
  });
}
