import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow the Next dev server to be reached through a Cloudflare tunnel and over
  // the local network (phone testing of the PWA / native shell). Without this,
  // Next 15 warns about — and will eventually block — cross-origin /_next/* asset
  // requests. Harmless in production (dev-only setting).
  allowedDevOrigins: ['*.trycloudflare.com', '192.168.1.8'],
};

export default nextConfig;
