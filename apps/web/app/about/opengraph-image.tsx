import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'Sobre WABOS';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OG() {
  return renderOg({
    title: 'Le devolvemos el tiempo a los negocios que viven en WhatsApp',
    subtitle: 'Hecho en Perú, para la forma en que aquí se vende de verdad.',
  });
}
