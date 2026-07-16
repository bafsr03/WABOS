import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'WABOS — Convierte tu WhatsApp en tu empleado más inteligente';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#0b0b0f',
          backgroundImage: 'radial-gradient(900px 500px at 20% -10%, rgba(91,75,255,0.55), transparent 60%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', width: 64, height: 64, borderRadius: 16, background: '#5b4bff', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#fff' }}>
            W
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: -1 }}>
            <span>WAB</span>
            <span style={{ color: '#8a7dff' }}>OS</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: '#fff', lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
            Convierte tu WhatsApp en tu empleado más inteligente
          </div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.72)', maxWidth: 820 }}>
            Responde, vende y verifica cada pago — sin salir del chat.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: '#25d366' }} />
          Inbox · Empleado IA · Cobros verificados · Campañas · CRM
        </div>
      </div>
    ),
    { ...size },
  );
}
