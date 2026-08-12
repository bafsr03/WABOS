'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Smartphone, History, DownloadCloud, Square } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { PageHeader, PageBody, Card, Button, Spinner, Badge } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Status { status: string; qrDataUrl: string | null; me: { id: string; name?: string } | null; aiAvailable: boolean; accountPhone?: string }
interface HistoryImport { id: number; status: string; source: string; messages_imported: number; chats_seen: number; progress: number }
interface HistoryStatus { import: HistoryImport | null; storedMessages: number; fullSync: boolean }

export default function ConnectPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [hist, setHist] = useState<HistoryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const refresh = useCallback(() => { api<Status>('/api/status').then(setStatus).catch(() => {}); }, []);
  const refreshHistory = useCallback(() => { api<HistoryStatus>('/api/history/status').then(setHist).catch(() => {}); }, []);

  useEffect(() => {
    // Ensure this business's socket is running — a freshly-registered tenant has
    // no stored credentials, so nothing started it at boot. session/open lazily
    // starts the socket (which emits the QR); it's a no-op if already connected.
    api('/api/session/open', { method: 'POST' })
      .catch(() => {})
      .finally(() => { refresh(); refreshHistory(); });
    return connectWs((event) => {
      if (event.type === 'wa.status') refresh();
      if (event.type === 'account.number_changed') {
        toast('Número cambiado: se reiniciaron las conversaciones. Tu catálogo y marca se mantienen.', 'info');
        refresh();
        refreshHistory();
      }
      if (event.type === 'history.progress') {
        setHist((h) => (h ? { ...h, import: event.import } : h));
        if (['done', 'stopped', 'failed'].includes(event.import?.status)) refreshHistory();
      }
    });
  }, [refresh, refreshHistory, toast]);

  const importing = hist?.import?.status === 'running';

  async function changeNumber() {
    if (!(await confirm({
      title: 'Cambiar o reconectar número',
      message: 'Se desvinculará el número actual y podrás escanear el QR. Si escaneas el MISMO número, tus datos se mantienen intactos. Si escaneas uno DIFERENTE, se reiniciarán las conversaciones y cobros (tu catálogo, marca, ADN de voz y contactos se mantienen).',
      confirmLabel: 'Continuar',
    }))) return;
    await api('/api/change-number', { method: 'POST' });
    toast('Escanea el QR para volver a vincular', 'info');
    refresh();
    refreshHistory();
  }

  async function logout() {
    if (!(await confirm({
      title: 'Borrar todo y empezar de cero',
      message: 'Se borrarán TODOS los datos de este WABOS: contactos, conversaciones, cobros, catálogo, ADN de voz y ajustes. Tendrás que escanear el QR de nuevo. Esto NO se puede deshacer.',
      confirmLabel: 'Borrar todo',
      danger: true,
    }))) return;
    await api('/api/logout', { method: 'POST' });
    toast('Datos borrados. Escanea el QR para empezar de cero', 'info');
    refresh();
    refreshHistory();
  }

  async function importOnDemand() {
    setBusy(true);
    try {
      await api('/api/history/import', { method: 'POST', body: JSON.stringify({ mode: 'on_demand' }) });
      toast('Importando historial…', 'success');
      refreshHistory();
    } catch (err: any) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function importFullRescan() {
    if (!(await confirm({
      title: 'Importar todo el historial',
      message: 'Para traer todo tu historial, WhatsApp necesita reenviarlo: tendrás que escanear el QR una vez más. ¿Continuar?',
      confirmLabel: 'Reconectar e importar',
    }))) return;
    setBusy(true);
    try {
      await api('/api/history/import', { method: 'POST', body: JSON.stringify({ mode: 'full_rescan' }) });
      // Relink WITHOUT wiping (change-number only unlinks + re-issues the QR; the
      // same number keeps all data). NEVER call /api/logout here — that wipes.
      await api('/api/change-number', { method: 'POST' });
      toast('Escanea el QR con el MISMO número para importar tu historial', 'info');
      refresh();
    } catch (err: any) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function stopImport() {
    await api('/api/history/stop', { method: 'POST' }).catch(() => {});
    refreshHistory();
  }

  return (
    <Shell>
      <PageBody className="max-w-2xl p-6 lg:p-8">
        <PageHeader title="Conexión de WhatsApp" subtitle="Vincula el número de tu negocio para que WABOS trabaje por ti." />

        <Card className="relative overflow-hidden p-8 text-center">
          <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-32" />
          {!status && <div className="py-8"><Spinner className="mx-auto h-8 w-8" /></div>}

          {status?.status === 'connected' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/12 text-success"><CheckCircle2 size={32} /></div>
              <h2 className="mt-4 font-display text-xl font-semibold text-fg">WhatsApp conectado</h2>
              <p className="mt-1 text-sm text-muted">
                {status.me?.name ? `${status.me.name} — ` : ''}
                <span className="tabular">{status.me?.id?.split(':')[0]?.split('@')[0]}</span>
              </p>
              {!status.aiAvailable && (
                <p className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-xl bg-warn/10 p-3 text-left text-xs text-warn">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  Sin ANTHROPIC_API_KEY el Empleado IA está desactivado: todas las conversaciones requieren respuesta humana.
                </p>
              )}
              <div className="mt-6 flex flex-col items-center gap-2">
                <Button variant="secondary" onClick={changeNumber}>Cambiar número</Button>
                <button onClick={logout} className="text-xs text-subtle transition hover:text-danger">
                  Borrar todo y empezar de cero
                </button>
              </div>
            </motion.div>
          )}

          {status?.status === 'qr' && status.qrDataUrl && (
            <div>
              <h2 className="font-display text-xl font-semibold text-fg">Escanea este código</h2>
              <ol className="mx-auto mt-3 max-w-xs space-y-1 text-left text-sm text-muted">
                <li className="flex gap-2"><span className="text-brand">1.</span> Abre WhatsApp en el teléfono del negocio</li>
                <li className="flex gap-2"><span className="text-brand">2.</span> Ajustes → Dispositivos vinculados</li>
                <li className="flex gap-2"><span className="text-brand">3.</span> Vincular un dispositivo → escanea</li>
              </ol>
              {/* bg-white is deliberate and must NOT be tokenized: the QR is
                  black-on-white and needs a true white quiet zone to stay
                  scannable, including in dark mode. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={status.qrDataUrl} alt="QR de WhatsApp" className="mx-auto mt-5 h-60 w-60 rounded-2xl border border-border bg-white p-2" />
              <p className="mt-2 text-xs text-subtle">El código se renueva automáticamente.</p>
            </div>
          )}

          {status && status.status !== 'connected' && status.status !== 'qr' && (
            <div className="py-6">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-subtle"><Smartphone size={24} /></div>
              <Spinner className="mx-auto mt-4 h-6 w-6" />
              <p className="mt-3 text-sm text-muted">Estado: {status.status}… esperando conexión</p>
            </div>
          )}
        </Card>

        {status?.status === 'connected' && (
          <Card className="mt-5 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand"><History size={18} /></span>
              <div className="min-w-0">
                <h3 className="font-semibold text-fg">Historial de conversaciones</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Por defecto WABOS empieza desde ahora y no importa tu historial. Puedes traerlo cuando quieras.
                </p>
              </div>
              <span className="ml-auto shrink-0"><Badge tone="neutral">{hist?.storedMessages ?? 0} mensajes</Badge></span>
            </div>

            {importing ? (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm font-medium text-fg"><Spinner className="h-4 w-4" /> Importando historial…</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full brand-gradient" initial={{ width: 0 }} animate={{ width: `${hist?.import?.progress ?? 0}%` }} transition={{ ease: 'easeOut' }} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="tabular text-xs text-subtle">{hist?.import?.messages_imported ?? 0} mensajes importados</p>
                  <Button size="sm" variant="secondary" onClick={stopImport}><Square size={13} /> Detener</Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={importOnDemand} disabled={busy}>
                  <DownloadCloud size={15} /> Importar bajo demanda
                </Button>
                <Button variant="secondary" onClick={importFullRescan} disabled={busy}>
                  <History size={15} /> Importar todo (reconectar)
                </Button>
              </div>
            )}
            {!importing && hist?.import && ['done', 'stopped', 'failed'].includes(hist.import.status) && (
              <div className="mt-3 text-xs text-subtle">
                <p>
                  Última importación: {hist.import.status === 'done' ? 'completada' : hist.import.status === 'stopped' ? 'detenida' : 'fallida'} · {hist.import.messages_imported} mensajes.
                </p>
                {hist.import.status === 'done' && hist.import.source === 'on_demand' && hist.import.messages_imported === 0 && (
                  <p className="mt-1 text-warn">
                    WhatsApp no envió mensajes más antiguos por esta vía. Para traer todo tu historial usa <b>Importar todo (reconectar)</b>.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}
      </PageBody>
    </Shell>
  );
}
