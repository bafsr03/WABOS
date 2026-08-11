import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'El producto WABOS — todo tu negocio sobre WhatsApp';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OG() {
  return renderOg({
    title: 'Todo tu negocio, sobre WhatsApp',
    subtitle: 'Los módulos que trabajan juntos para que atiendas, vendas y cobres sin salir del chat.',
  });
}
