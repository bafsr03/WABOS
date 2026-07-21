import { JWT } from 'google-auth-library';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Firebase Cloud Messaging HTTP v1 sender. FCM delivers to Android (native) and,
// with an APNs key uploaded to Firebase, to iOS too — so one transport covers
// both native platforms. Disabled cleanly when no service-account is configured.

let jwtClient: JWT | null = null;
const fcmConfigured = Boolean(config.fcmProjectId && config.fcmClientEmail && config.fcmPrivateKey);

if (fcmConfigured) {
  jwtClient = new JWT({
    email: config.fcmClientEmail,
    key: config.fcmPrivateKey,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
}

export function isFcmConfigured(): boolean {
  return fcmConfigured;
}

export interface FcmMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Send one notification to one device token. Returns 'ok', or 'gone' when FCM
// reports the token is no longer valid (so the caller can prune it), or 'error'.
export async function sendFcm(token: string, msg: FcmMessage): Promise<'ok' | 'gone' | 'error'> {
  if (!jwtClient) return 'error';
  try {
    const { token: accessToken } = await jwtClient.getAccessToken();
    if (!accessToken) return 'error';

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${config.fcmProjectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          // Send as data-only so the app controls presentation consistently on
          // both platforms (the Capacitor listener builds the local notification).
          notification: { title: msg.title, body: msg.body },
          data: { url: msg.url ?? '/', tag: msg.tag ?? '' },
          apns: { payload: { aps: { sound: 'default' } } },
          android: { priority: 'high', notification: { sound: 'default' } },
        },
      }),
    });

    if (res.ok) return 'ok';
    const errBody: any = await res.json().catch(() => ({}));
    const status = errBody?.error?.details?.[0]?.errorCode ?? errBody?.error?.status;
    // UNREGISTERED / INVALID_ARGUMENT on the token → prune it.
    if (res.status === 404 || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT') return 'gone';
    logger.warn({ status: res.status, errBody }, 'FCM send failed');
    return 'error';
  } catch (err) {
    logger.warn({ err }, 'FCM send threw');
    return 'error';
  }
}
