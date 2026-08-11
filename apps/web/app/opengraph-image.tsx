import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

export const alt = 'WABOS — Convierte tu WhatsApp en tu empleado más inteligente';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OG() {
  return renderOg({
    title: 'Convierte tu WhatsApp en tu empleado más inteligente',
    subtitle: 'Responde, vende y verifica cada pago — sin salir del chat.',
  });
}
