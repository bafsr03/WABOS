'use client';

import { useEffect, useState } from 'react';
import { Download, Bell, X, Share } from 'lucide-react';
import { pushSupported, enablePush } from '@/lib/push';
import { useToast } from '@/components/ui/Toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'wabos_install_dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}
function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// A dismissible banner shown above the mobile nav that (a) installs the PWA on
// Android via beforeinstallprompt, (b) explains "Add to Home Screen" on iOS, and
// (c) lets the owner turn on push notifications. Hidden once installed + dismissed.
export default function InstallPrompt() {
  const toast = useToast();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [needsNotif, setNeedsNotif] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    setNeedsNotif(pushSupported() && Notification.permission === 'default');

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const installed = isStandalone();
  // Nothing to offer: installed and notifications already decided.
  if (dismissed || (installed && !needsNotif)) return null;
  // Non-iOS with no install event and no notification ask → nothing actionable.
  if (!installed && !deferred && !isIOS() && !needsNotif) return null;

  function close() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  async function install() {
    if (!deferred) { setShowIosHint(true); return; }
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') close();
    setDeferred(null);
  }

  async function turnOnNotifications() {
    const ok = await enablePush();
    toast(ok ? 'Notificaciones activadas' : 'No se pudieron activar las notificaciones', ok ? 'success' : 'error');
    if (ok) setNeedsNotif(false);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:hidden">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-surface/95 p-3.5 shadow-[0_10px_34px_-10px_rgba(11,11,15,0.4)] backdrop-blur-xl">
        <button onClick={close} aria-label="Cerrar" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg">
          <X size={15} />
        </button>
        {showIosHint ? (
          <div className="pr-6 text-sm text-fg">
            <p className="font-medium">Instala WABOS</p>
            <p className="mt-1 text-xs text-muted">Toca <Share size={12} className="inline -translate-y-0.5" /> Compartir y luego <span className="font-medium">“Agregar a inicio”</span>.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pr-6">
            <div className="text-sm">
              <p className="font-medium text-fg">Lleva WABOS en tu bolsillo</p>
              <p className="mt-0.5 text-xs text-muted">Instálalo y recibe avisos de pagos y mensajes.</p>
            </div>
            <div className="flex gap-2">
              {!installed && (
                <button onClick={install} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-strong">
                  <Download size={14} /> Instalar
                </button>
              )}
              {needsNotif && (
                <button onClick={turnOnNotifications} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-fg transition hover:border-border-strong">
                  <Bell size={14} /> Notificaciones
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
