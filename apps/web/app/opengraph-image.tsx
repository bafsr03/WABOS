import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'WABOS — Convierte tu WhatsApp en tu empleado más inteligente';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG() {
  const logoBuffer = await readFile(join(process.cwd(), 'public/logo.png'));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} style={{ borderRadius: 16 }} alt="" />
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
