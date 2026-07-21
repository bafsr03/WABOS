import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the deployed WABOS dashboard directly (server.url), so
// web changes ship instantly without a new store build. Set WABOS_APP_URL to the
// dashboard's public HTTPS origin before running `cap sync`:
//
//   WABOS_APP_URL=https://app.wabos.pe pnpm --filter @wabos/mobile sync
//   WABOS_APP_URL=https://<your>.trycloudflare.com pnpm --filter @wabos/mobile sync   # testing
//
// When WABOS_APP_URL is unset, the app falls back to the bundled www/ page (a
// friendly "configure me" screen) — useful to confirm the native build runs.
const appUrl = process.env.WABOS_APP_URL?.trim();

const config: CapacitorConfig = {
  appId: 'pe.wabos.app',
  appName: 'WABOS',
  webDir: 'www',
  ...(appUrl
    ? { server: { url: appUrl, cleartext: appUrl.startsWith('http://') } }
    : {}),
  backgroundColor: '#ffffff',
  ios: {
    // Content extends under the translucent status bar for the glass look; the
    // web layout already honors env(safe-area-inset-*).
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 500,
      backgroundColor: '#5b4bff',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
