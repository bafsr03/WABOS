'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Check, X, Bell, ChevronDown, Wallet, ShieldCheck, BadgeCheck, UserCheck, ScanLine } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, fetchMediaUrl } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { cn } from '@/lib/cn';
import { PageHeader, Card, SectionCard, Select, Input, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { Modal, useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Charge { id: number; contact_id: number; amount: number; currency: string; concept: string; status: string; due_at: number | null; paid_at: number | null; reminder_count: number; last_reminded_at: number | null; created_at: number; contact_name: string; contact_phone: string; method: string | null }
interface PaymentNotification { id: number; source: string; provider: string | null; amount: number | null; currency: string; operation_number: string | null; sender_name: string | null; received_at: number; consumed_by_receipt_id: number | null }
interface Receipt { id: number; media_id: number; charge_id: number | null; contact_name: string; contact_phone: string; provider: string | null; amount: number | null; currency: string | null; date: string | null; operation_number: string | null; sender_name: string | null; recipient_name: string | null; confidence: number | null; outcome: string; reasons: string[]; created_at: number; charge_amount: number | null; charge_currency: string | null; charge_concept: string | null }
interface Contact { id: number; name: string; phone: string }

const CHARGE_LABEL: Record<string, string> = { pending: 'Pendiente', paid: 'Pagado', review: 'En revisión', rejected: 'Rechazado', expired: 'Vencido', cancelled: 'Cancelado' };
const CHARGE_TONE: Record<string, any> = { paid: 'success', review: 'warn', pending: 'neutral', rejected: 'danger', expired: 'danger', cancelled: 'neutral' };
const REASON_LABEL: Record<string, string> = {
  no_pending_charge: 'Sin cobro pendiente', amount_not_readable: 'Monto no legible', amount_mismatch: 'Monto no coincide',
  currency_mismatch: 'Moneda no coincide', recipient_mismatch: 'Destinatario no coincide', date_not_readable: 'Fecha no legible',
  date_out_of_window: 'Comprobante antiguo', operation_number_missing: 'Sin N° de operación', operation_number_reused: '⚠️ N° ya usado',
  low_confidence: 'Lectura poco confiable', auto_confirm_disabled: 'Auto-confirmación off', no_bank_match: 'Sin cruce bancario',
  awaiting_bank_match: 'Esperando banco', extraction_unavailable: 'Lectura AI no disponible', processing_failed: 'Error de procesamiento',
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
  if (!url) return <div className="skeleton h-64 w-40 shrink-0 rounded-xl" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={url} alt="Comprobante" className="max-h-64 w-40 rounded-xl border border-border object-contain" />
    </a>
  );
}

function MethodBadge({ method }: { method: string }) {
  if (method === 'bank_match') return <Badge tone="success"><BadgeCheck size={12} /> Banco</Badge>;
  if (method === 'manual') return <Badge tone="neutral"><UserCheck size={12} /> Manual</Badge>;
  return <Badge tone="neutral"><ScanLine size={12} /> Comprobante</Badge>;
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
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(() => {
    api<Charge[]>(`/api/charges${filter ? `?status=${filter}` : ''}`).then(setCharges).catch(() => {});
    api<Receipt[]>('/api/receipts?outcome=review').then(setReviews).catch(() => {});
    api<Contact[]>('/api/contacts').then(setContacts).catch(() => {});
    api<PaymentNotification[]>('/api/payment-notifications').then(setNotifications).catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
    return connectWs((event) => {
      if (['charge.updated', 'receipt.review_needed', 'payment.notification'].includes(event.type)) load();
    });
  }, [load]);

  const lastNotif = notifications[0]?.received_at;
  const lastNotifAgo = lastNotif ? Math.round((Date.now() / 1000 - lastNotif) / 60) : null;

  async function createCharge(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api('/api/charges', { method: 'POST', body: JSON.stringify({ contactId: Number(form.contactId), amount: Number(form.amount), concept: form.concept }) });
      setForm({ contactId: '', amount: '', concept: '' });
      setShowForm(false);
      toast('Cobro creado', 'success');
      load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function review(receiptId: number, action: 'approve' | 'reject') {
    try {
      await api(`/api/receipts/${receiptId}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      toast(action === 'approve' ? 'Pago aprobado' : 'Comprobante rechazado', action === 'approve' ? 'success' : 'info');
      load();
    } catch (err: any) { toast(err.message, 'error'); }
  }

  async function cancelCharge(id: number) {
    if (!(await confirm({ title: 'Cancelar cobro', confirmLabel: 'Cancelar cobro', danger: true }))) return;
    try { await api(`/api/charges/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }); toast('Cobro cancelado', 'info'); load(); }
    catch (err: any) { toast(err.message, 'error'); }
  }

  async function remind(id: number) {
    try { await api(`/api/charges/${id}/remind`, { method: 'POST', body: JSON.stringify({}) }); toast('Recordatorio enviado', 'success'); load(); }
    catch (err: any) { toast(err.message, 'error'); }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <PageHeader title="Cobros" subtitle="Crea cobros y WABOS valida los comprobantes Yape/Plin."
          actions={<Button onClick={() => setShowForm(true)}><Plus size={15} /> Nuevo cobro</Button>} />

        {/* Review queue */}
        {reviews.length > 0 && (
          <SectionCard className="mb-6 border-warn/30"
            title={`Comprobantes por revisar`} desc="Confirmados solo tras tu aprobación"
            actions={<Badge tone="warn"><ShieldCheck size={12} /> {reviews.length}</Badge>}>
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="flex flex-col gap-4 rounded-xl border border-warn/25 bg-warn/[0.05] p-4 sm:flex-row">
                  <ReceiptImage mediaId={r.media_id} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium text-fg">{r.contact_name || r.contact_phone}</div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <dt className="text-subtle">Monto leído</dt><dd className="tabular font-medium text-fg">{money(r.amount, r.currency)}</dd>
                      <dt className="text-subtle">Cobro esperado</dt><dd className="tabular font-medium text-fg">{money(r.charge_amount, r.charge_currency)} {r.charge_concept ? `· ${r.charge_concept}` : ''}</dd>
                      <dt className="text-subtle">Medio</dt><dd className="text-fg">{r.provider ?? '—'}</dd>
                      <dt className="text-subtle">N° operación</dt><dd className="tabular text-fg">{r.operation_number ?? '—'}</dd>
                      <dt className="text-subtle">Fecha</dt><dd className="text-fg">{r.date ?? '—'}</dd>
                      <dt className="text-subtle">Destinatario</dt><dd className="text-fg">{r.recipient_name ?? '—'}</dd>
                      <dt className="text-subtle">Confianza</dt><dd className="tabular text-fg">{r.confidence !== null ? `${Math.round(r.confidence * 100)}%` : '—'}</dd>
                    </dl>
                    {r.reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.reasons.map((reason) => <Badge key={reason} tone="warn">{REASON_LABEL[reason] ?? reason}</Badge>)}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => review(r.id, 'approve')}><Check size={14} /> Aprobar</Button>
                      <Button size="sm" variant="danger" onClick={() => review(r.id, 'reject')}><X size={14} /> Rechazar</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Charges */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-fg">Historial de cobros</h2>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto py-1.5 text-xs">
            <option value="">Todos</option>
            {Object.entries(CHARGE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
        <Card className="overflow-hidden">
          {charges.length === 0 ? (
            <div className="p-4"><EmptyState icon={<Wallet size={24} />} title="Sin cobros todavía" desc="Crea uno con “Nuevo cobro”." tall /></div>
          ) : charges.map((c) => {
            const overdue = c.status === 'pending' && c.due_at !== null && c.due_at < Date.now() / 1000;
            return (
            <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{c.contact_name || c.contact_phone}
                  {c.concept && <span className="ml-2 text-xs font-normal text-subtle">{c.concept}</span>}</div>
                <div className="tabular flex items-center gap-2 text-xs text-subtle">
                  <span>{new Date(c.created_at * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {c.due_at !== null && <span className={cn(overdue && 'font-medium text-danger')}>· vence {new Date(c.due_at * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</span>}
                  {c.reminder_count > 0 && <span className="inline-flex items-center gap-0.5"><Bell size={11} /> {c.reminder_count}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="tabular text-sm font-semibold text-fg">{money(c.amount, c.currency)}</span>
                {c.status === 'paid' && c.method && <MethodBadge method={c.method} />}
                <Badge tone={overdue ? 'danger' : CHARGE_TONE[c.status] ?? 'neutral'}>{overdue ? 'Vencido' : CHARGE_LABEL[c.status] ?? c.status}</Badge>
                {(c.status === 'pending' || c.status === 'review') && (
                  <>
                    <button onClick={() => remind(c.id)} className="text-xs text-subtle transition hover:text-brand">Recordar</button>
                    <button onClick={() => cancelCharge(c.id)} className="text-xs text-subtle transition hover:text-danger">Cancelar</button>
                  </>
                )}
              </div>
            </div>
          );})}
        </Card>

        {/* Bank notifications */}
        <div className="mt-6">
          <button onClick={() => setShowNotifs((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-5 py-3 text-left text-sm transition hover:border-border-strong">
            <span className="inline-flex items-center gap-2 font-semibold text-fg"><Bell size={15} className="text-brand" /> Notificaciones de pago (banco)</span>
            <span className="inline-flex items-center gap-2 text-xs text-subtle">
              {lastNotifAgo === null ? 'Sin notificaciones aún' : `última hace ${lastNotifAgo} min`}
              <ChevronDown size={15} className={cn('transition', showNotifs && 'rotate-180')} />
            </span>
          </button>
          {showNotifs && (
            <Card className="mt-2 overflow-hidden">
              {notifications.length === 0 ? (
                <p className="p-5 text-sm text-muted">Aún no llegan notificaciones reales de Yape/Plin. Configúralas en Ajustes → Verificación bancaria.</p>
              ) : notifications.map((n) => (
                <div key={n.id} className="flex items-center justify-between border-b border-border px-5 py-2.5 text-sm last:border-0">
                  <div>
                    <span className="tabular font-medium text-fg">{money(n.amount, n.currency)}</span>
                    <span className="tabular ml-2 text-xs text-subtle">{n.provider ?? '—'} · op {n.operation_number ?? '—'} · {n.source}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {n.consumed_by_receipt_id && <Badge tone="success">usada</Badge>}
                    <span className="tabular text-xs text-subtle">{new Date(n.received_at * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo cobro">
        <form onSubmit={createCharge} className="space-y-3">
          <Select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
            <option value="">Cliente…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name || c.phone}</option>)}
          </Select>
          <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Monto (S/)" type="number" step="0.01" min="0.01" />
          <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Concepto, ej. Pedido #12" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button disabled={busy || !form.contactId || !form.amount}>{busy ? 'Creando…' : 'Crear cobro'}</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
