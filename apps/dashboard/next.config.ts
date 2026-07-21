import type { NextConfig } from 'next';

// Where the dashboard proxies /api and /ws when it serves them same-origin. In
// dev that's the local engine; in prod set ENGINE_ORIGIN to the engine's URL.
const engineOrigin = process.env.ENGINE_ORIGIN || 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Allow the Next dev server to be reached through a tunnel / the IDE port
  // forwarder / the local network (phone testing). Without this, Next 15 warns
  // about — and will eventually block — cross-origin /_next/* asset requests.
  allowedDevOrigins: ['*.trycloudflare.com', '*.devtunnels.ms', '*.loca.lt', '*.ngrok-free.app', '192.168.1.8'],

  // Same-origin proxy to the engine. This lets phone testing work with a SINGLE
  // public URL (just forward port 3000): set NEXT_PUBLIC_ENGINE_URL="" so the app
  // calls /api and /ws on its own origin, and Next forwards them to the engine —
  // no second tunnel, no CORS. When NEXT_PUBLIC_ENGINE_URL points straight at the
  // engine (the cross-origin default), these rewrites simply go unused.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${engineOrigin}/api/:path*` },
        { source: '/ws', destination: `${engineOrigin}/ws` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
