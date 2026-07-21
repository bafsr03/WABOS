import { ImageResponse } from 'next/og';

// Dynamic PWA icons — a branded "W" on Electric Indigo, rendered at the requested
// size so we don't need to check in binary PNG assets. Used by the manifest, the
// service worker (notification icon/badge) and Apple touch icon.
export const dynamic = 'force-static';

const ALLOWED = new Set([96, 180, 192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = ALLOWED.has(Number(raw)) ? Number(raw) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#5b4bff',
          color: '#ffffff',
          fontSize: size * 0.56,
          fontWeight: 800,
          letterSpacing: -size * 0.02,
        }}
      >
        W
      </div>
    ),
    { width: size, height: size },
  );
}

export function generateStaticParams() {
  return [{ size: '96' }, { size: '180' }, { size: '192' }, { size: '512' }];
}
