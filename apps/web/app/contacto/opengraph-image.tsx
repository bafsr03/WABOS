import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'Contacta al equipo de WABOS';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OG() {
  return renderOg({
    title: 'Hablemos de tu negocio',
    subtitle: 'Escríbenos y te respondemos con una persona, no con un formulario automático.',
    footer: 'support@wabos.co',
  });
}
