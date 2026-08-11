import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Shared Open Graph card. Node runtime only — it reads the logo off disk, so
 * do NOT add `export const runtime = 'edge'` to any consumer.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

export async function renderOg({
  title, subtitle, footer,
}: { title: string; subtitle?: string; footer?: string }) {
  const logo = await readFile(join(process.cwd(), 'public/logo.png'));
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

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
          background: '#05060d',
          backgroundImage:
            'radial-gradient(900px 500px at 15% -10%, rgba(91,75,255,0.55), transparent 60%), radial-gradient(600px 400px at 95% 15%, rgba(37,211,102,0.10), transparent 60%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} style={{ borderRadius: 16 }} alt="" />
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#f4f5fa', letterSpacing: -1 }}>
            <span>WAB</span>
            <span style={{ color: '#8a7dff' }}>OS</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 66, fontWeight: 700, color: '#f4f5fa', lineHeight: 1.05, letterSpacing: -2, maxWidth: 960 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 30, color: 'rgba(244,245,250,0.68)', maxWidth: 860 }}>{subtitle}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: 'rgba(244,245,250,0.55)' }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: '#25d366' }} />
          {footer ?? 'Inbox · Empleado IA · Cobros verificados · Punto de venta · Analítica'}
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
