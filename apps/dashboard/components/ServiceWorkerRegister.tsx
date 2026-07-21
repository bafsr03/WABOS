'use client';

import { useEffect } from 'react';
import { getToken } from '@/lib/api';
import { pushSupported, subscribeToPush } from '@/lib/push';

// Registers the service worker on every page load and re-syncs the push
// subscription when the user has already granted notification permission (so a
// re-install / new device keeps receiving alerts). Renders nothing.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(() => {
      // Only (re)subscribe when logged in and already permitted — never prompts here.
      if (getToken() && pushSupported() && Notification.permission === 'granted') {
        void subscribeToPush();
      }
    }).catch(() => {});
  }, []);
  return null;
}
