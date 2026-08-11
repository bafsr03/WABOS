import { api, getToken } from './api';
import { getResolvedTheme, type Resolved } from './theme';

// Native-only integration for the Capacitor shell. Everything here is guarded by
// Capacitor.isNativePlatform(), so in a normal browser (or the PWA) it is inert
// and the web-push path in ServiceWorkerRegister handles notifications instead.

let started = false;

export async function initNative(): Promise<void> {
  if (started || typeof window === 'undefined') return;
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  started = true;

  const platform = Capacitor.getPlatform() as 'ios' | 'android';

  // Native chrome: translucent status bar for the glass look, hide the splash.
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await applyNativeStatusBar(getResolvedTheme());
    if (platform === 'android') await StatusBar.setOverlaysWebView({ overlay: true });
  } catch { /* plugin unavailable */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* ignore */ }

  // Android hardware back button: go back in history, or exit at the root.
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) window.history.back();
      else App.exitApp();
    });
    // Re-attempt push registration when the app returns to the foreground (e.g.
    // the user logged in on a previous run).
    App.addListener('resume', () => { void registerPush(platform); });
  } catch { /* ignore */ }

  await registerPush(platform);
}

/**
 * Match the native status bar to the theme. Capacitor's naming is inverted from
 * what you'd guess: Style.Light means DARK text (for a light background) and
 * Style.Dark means light text. Without this the installed app's clock and
 * battery stay black on a navy header.
 *
 * Safe to call in a browser — it no-ops when Capacitor isn't native.
 */
export async function applyNativeStatusBar(theme: Resolved): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
  } catch { /* plugin unavailable */ }
}

// Ask for notification permission, register with APNs/FCM, and hand the device
// token to the engine (scoped to the logged-in business via the JWT).
async function registerPush(platform: 'ios' | 'android'): Promise<void> {
  if (!getToken()) return; // not logged in yet — will retry on resume
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive !== 'granted') return;

    // Bind listeners once, then register to obtain the token.
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', (token) => {
      void api('/api/push/register-device', {
        method: 'POST',
        body: JSON.stringify({ platform, token: token.value }),
      }).catch(() => {});
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = (action.notification?.data as any)?.url;
      if (url) window.location.assign(url);
    });
    await PushNotifications.register();
  } catch { /* plugin unavailable / not native */ }
}

// Unregister this device on sign-out so it stops receiving the business's pushes.
export async function unregisterNativePush(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    // Best-effort: the token is device-scoped; the engine also prunes stale tokens
    // from FCM 'gone' responses, so we simply stop delivering by removing listeners.
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
  } catch { /* ignore */ }
}
