'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fetchMediaUrl } from '@/lib/api';
import { connectWs } from '@/lib/ws';

interface Charge {
  id: number; contact_id: number; amount: number; currency: string; concept: string;
  status: string; due_at: number | null; paid_at: number | null; created_at: number;
  contact_name: string; contact_phone: string; method: string | null;
}
interface PaymentNotification {
  id: number; source: string; provider: string | null; amount: number | null;
  currency: string; operation_number: string | null; sender_name: string | null;
  received_at: number; consumed_by_receipt_id: number | null;
}
interface Receipt {
  id: number; media_id: number; charge_id: number | null; contact_name: string; contact_phone: string;
  provider: string | null; amount: number | null; currency: string | null; date: string | null;
  operation_number: string | null; sender_name: string | null; recipient_name: string | null;
  confidence: number | null; outcome: string; reasons: string[]; created_at: number;
  charge_amount: number | null; charge_currency: string | null; charge_concept: string | null;
}
interface Contact { id: number; name: string; phone: string }

const CHARGE_LABEL: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', review: 'En revisión',
  rejected: 'Rechazado', expired: 'Vencido', cancelled: 'Cancelado',
};
const CHARGE_STYLE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  review: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
};
const REASON_LABEL: Record<string, string> = {
  no_pending_charge: 'Sin cobro pendiente',
  amount_not_readable: 'Monto no legible',
  amount_mismatch: 'Monto no coincide',
  currency_mismatch: 'Moneda no coincide',
  recipient_mismatch: 'Destinatario no coincide',
  date_not_readable: 'Fecha no legible',
  date_out_of_window: 'Comprobante antiguo',
  operation_number_missing: 'Sin N° de operación',
  operation_number_reused: '⚠️ N° de operación ya usado',
  low_confidence: 'Lectura poco confiable',
  auto_confirm_disabled: 'Confirmación automática desactivada',
  extraction_unavailable: 'Lectura AI no disponible',
  processing_failed: 'Error de procesamiento',
};

function money(amount: number | null, currency: string | null) {
  if (amount === null) return '—';
  return `${currency === 'PEN' || !currency ? 'S/' : currency} ${amount.toFixed(2)}`;
}

function ReceiptImage({ mediaId }: { mediaId: number }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoked = '';
    fetchMediaUrl(mediaId).then((u) => { revoked = u; setUrl(u); }).catch(() => {});
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [mediaId]);
  if (!url) return <div className="h-64 w-40 animate-pulse rounded-lg bg-slate-100" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Comprobante" className="max-h-64 w-40 rounded-lg border border-slate-200 object-contain" />
    </a>
  );
}

export default function PaymentsPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [reviews, setReviews] = useState<Receipt[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [form, setForm] = useState({ contactId: '', amount: '', concept: '' });
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Charge[]>(`/api/charges${filter ? `?status=${filter}` : ''}`).then(setCharges).catch(() => {});
    api<Receipt[]>('/api/receipts?outcome=review').then(setReviews).catch(() => {});
    api<Contact[]>('/api/contacts').then(setContacts).catch(() => {});
    api<PaymentNotification[]>('/api/payment-notifications').then(setNotifications).catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
    return connectWs((event) => {
      if (event.type === 'charge.updated' || event.type === 'receipt.review_needed' || event.type === 'payment.notification') load();
    });
  }, [load]);

  const lastNotif = notifications[0]?.received_at;
  const lastNotifAgo = lastNotif ? Math.round((Date.now() / 1000 - lastNotif) / 60) : null;

  async function createCharge(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/charges', {
        method: 'POST',
        body: JSON.stringify({
          contactId: Number(form.contactId),
          amount: Number(form.amount),
          concept: form.concept,
        }),
      });
      setForm({ contactId: '', amount: '', concept: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(receiptId: number, action: 'approve' | 'reject') {
    setError('');
    try {
      await api(`/api/receipts/${receiptId}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function cancelCharge(id: number) {
    if (!confirm('¿Cancelar este cobro?')) return;
    try {
      await api(`/api/charges/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cobros</h1>
            <p className="mt-1 text-sm text-slate-500">
              Crea cobros y WABOS valida los comprobantes Yape/Plin que envían tus clientes.
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white"
          >
            {showForm ? 'Cerrar' : 'Nuevo cobro'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={createCharge} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              <select
                value={form.contactId}
                onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
              >
                <option value="">Cliente…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.phone}</option>
                ))}
              </select>
              <input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="Monto (S/)"
                type="number" step="0.01" min="0.01"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
              />
              <input
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                placeholder="Concepto, ej. Pedido #12"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                disabled={busy || !form.contactId || !form.amount}
                className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Creando…' : 'Crear cobro'}
              </button>
            </div>
          </form>
        )}

        {reviews.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-amber-700">
              🔍 Comprobantes por revisar ({reviews.length})
            </h2>
            <div className="mt-2 space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="flex gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <ReceiptImage mediaId={r.media_id} />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{r.contact_name || r.contact_phone}</div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <dt className="text-slate-500">Monto leído</dt>
                      <dd className="font-medium">{money(r.amount, r.currency)}</dd>
                      <dt className="text-slate-500">Cobro esperado</dt>
                      <dd className="font-medium">{money(r.charge_amount, r.charge_currency)} {r.charge_concept ? `· ${r.charge_concept}` : ''}</dd>
                      <dt className="text-slate-500">Medio</dt>
                      <dd>{r.provider ?? '—'}</dd>
                      <dt className="text-slate-500">N° operación</dt>
                      <dd>{r.operation_number ?? '—'}</dd>
                      <dt className="text-slate-500">Fecha</dt>
                      <dd>{r.date ?? '—'}</dd>
                      <dt className="text-slate-500">Destinatario</dt>
                      <dd>{r.recipient_name ?? '—'}</dd>
                      <dt className="text-slate-500">Confianza</dt>
                      <dd>{r.confidence !== null ? `${Math.round(r.confidence * 100)}%` : '—'}</dd>
                    </dl>
                    {r.reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.reasons.map((reason) => (
                          <span key={reason} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            {REASON_LABEL[reason] ?? reason}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => review(r.id, 'approve')}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        ✓ Aprobar pago
                      </button>
                      <button
                        onClick={() => review(r.id, 'reject')}
                        className="rounded-lg border border-red-300 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        ✗ Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Cobros</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none"
          >
            <option value="">Todos</option>
            {Object.entries(CHARGE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {charges.length === 0 && <p className="p-6 text-sm text-slate-400">Sin cobros todavía.</p>}
          {charges.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-slate-100 px-5 py-3 last:border-0">
              <div>
                <span className="text-sm font-medium">{c.contact_name || c.contact_phone}</span>
                {c.concept && <span className="ml-2 text-xs text-slate-400">{c.concept}</span>}
                <div className="text-xs text-slate-400">
                  {new Date(c.created_at * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{money(c.amount, c.currency)}</span>
                {c.status === 'paid' && c.method && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.method === 'bank_match' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    title={c.method === 'bank_match' ? 'Confirmado contra la notificación real del banco' : 'Verificado solo por el comprobante (sin cruce bancario)'}
                  >
                    {c.method === 'bank_match' ? '✅ Confirmado por banco' : c.method === 'manual' ? '👤 Manual' : '🔍 Solo comprobante'}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHARGE_STYLE[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {CHARGE_LABEL[c.status] ?? c.status}
                </span>
                {(c.status === 'pending' || c.status === 'review') && (
                  <button onClick={() => cancelCharge(c.id)} className="text-xs text-slate-400 hover:text-red-500">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <button
            onClick={() => setShowNotifs((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 text-left text-sm shadow-sm"
          >
            <span className="font-semibold text-slate-700">🔔 Notificaciones de pago (banco)</span>
            <span className="text-xs text-slate-400">
              {lastNotifAgo === null ? 'Sin notificaciones aún' : `última hace ${lastNotifAgo} min`} · {showNotifs ? 'ocultar' : 'ver'}
            </span>
          </button>
          {showNotifs && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {notifications.length === 0 && (
                <p className="p-5 text-sm text-slate-400">
                  Aún no llegan notificaciones reales de Yape/Plin. Configúralas en Ajustes → Pagos para habilitar la confirmación automática.
                </p>
              )}
              {notifications.map((n) => (
                <div key={n.id} className="flex items-center justify-between border-b border-slate-100 px-5 py-2.5 text-sm last:border-0">
                  <div>
                    <span className="font-medium">{money(n.amount, n.currency)}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {n.provider ?? '—'} · op {n.operation_number ?? '—'} · {n.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {n.consumed_by_receipt_id && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">usada</span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(n.received_at * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
