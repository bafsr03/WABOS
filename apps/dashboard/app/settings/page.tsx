'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Sparkles, Wallet, ShieldCheck, HelpCircle, Trash2, AlertTriangle, Store, Wand2, CreditCard, Check, type LucideIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, deleteAccount, getStatus, startCheckout, openBillingPortal, changePlan, cancelSubscription, resumeSubscription, syncBilling, type Status, type CheckoutTier, type BillingInterval } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, SectionCard, Input, Textarea, Select, Switch, Button, Field, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Modal';

interface Faq { id: number; question: string; answer: string }

type TabId = 'ia' | 'perfil' | 'plan' | 'pagos' | 'faqs';
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'ia', label: 'Empleado IA', icon: Bot },
  { id: 'perfil', label: 'Perfil', icon: Store },
  { id: 'plan', label: 'Plan', icon: CreditCard },
  { id: 'pagos', label: 'Pagos', icon: Wallet },
  { id: 'faqs', label: 'FAQs', icon: HelpCircle },
];

const PROFILE: { key: string; label: string; hint?: string; textarea?: boolean }[] = [
  { key: 'business_name', label: 'Nombre del negocio' },
  { key: 'business_description', label: 'Descripción', hint: 'Qué vendes, dónde estás, delivery, métodos de pago…', textarea: true },
  { key: 'business_hours', label: 'Horario de atención' },
  { key: 'ai_tone', label: 'Tono del Empleado IA', hint: 'Ej.: amigable y cercano, responde en español peruano' },
  { key: 'ai_instructions', label: 'Instrucciones extra para la IA', hint: 'Reglas propias del negocio', textarea: true },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' });
  const [aiAvailable, setAiAvailable] = useState(true);
  const [tab, setTab] = useState<TabId>(() =>
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('billing')) ? 'plan' : 'ia');
  const toast = useToast();

  const load = useCallback(() => {
    api<Record<string, any>>('/api/settings').then((s) => {
      setAiAvailable(Boolean(s._aiAvailable));
      delete s._aiAvailable;
      setSettings(s);
    }).catch(() => {});
    api<Faq[]>('/api/faqs').then(setFaqs).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    toast('Ajustes guardados', 'success');
  }
  async function saveOne(key: string, value: string) {
    set(key, value);
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ [key]: value }) });
  }
  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/faqs', { method: 'POST', body: JSON.stringify(faqForm) });
    setFaqForm({ question: '', answer: '' });
    load();
  }
  async function removeFaq(id: number) {
    await api(`/api/faqs/${id}`, { method: 'DELETE' });
    load();
  }

  const aiEnabled = settings.ai_enabled !== '0';

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-5 p-6 lg:p-8">
        <PageHeader title="Ajustes" subtitle="Perfil del negocio y configuración del Empleado IA." />

        {/* Segmented tabs */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                    active ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg',
                  )}
                >
                  <Icon size={15} className={active ? 'text-brand' : 'text-subtle'} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Empleado IA ── */}
        {tab === 'ia' && (
        <div className="space-y-5 fade-up">
        {/* AI employee */}
        <Card className="flex items-center justify-between p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/12 text-brand"><Bot size={18} /></span>
            <div>
              <div className="font-medium text-fg">Empleado IA</div>
              <p className="text-xs text-muted">
                {aiAvailable ? 'Responde automáticamente las conversaciones en modo IA.'
                  : <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle size={12} /> Sin ANTHROPIC_API_KEY la IA no puede responder.</span>}
              </p>
            </div>
          </div>
          <Switch checked={aiEnabled} onChange={(v) => saveOne('ai_enabled', v ? '1' : '0')} label="Activar IA" />
        </Card>

        {/* Model */}
        <Card className="p-5">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /><span className="font-medium text-fg">Modelo del Empleado IA</span></div>
          <p className="mt-1 text-xs text-muted"><b>Calidad</b> (Sonnet 5) da las mejores respuestas de venta. <b>Ahorro</b> (Haiku 4.5) cuesta ~3× menos. El caché de contexto (ya activo) baja aún más el costo.</p>
          <Select className="mt-3" value={settings.ai_model || 'claude-sonnet-5'} onChange={(e) => saveOne('ai_model', e.target.value)}>
            <option value="claude-sonnet-5">Calidad — Claude Sonnet 5</option>
            <option value="claude-haiku-4-5">Ahorro — Claude Haiku 4.5</option>
          </Select>
        </Card>

        {/* Voice DNA */}
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent"><Wand2 size={18} /></span>
            <div>
              <div className="font-medium text-fg">ADN de voz</div>
              <p className="text-xs text-muted">
                {settings.communication_profile
                  ? 'Tu estilo aprendido está aplicado: la IA responde con la voz de tu negocio.'
                  : 'Deja que la IA lea tu historial y aprenda cómo escribe tu negocio.'}
              </p>
            </div>
          </div>
          <Link href="/voice"><Button size="sm" variant="secondary">{settings.communication_profile ? 'Ver' : 'Analizar'}</Button></Link>
        </Card>
        </div>
        )}

        {/* ── Perfil del negocio ── */}
        {tab === 'perfil' && (
        <div className="space-y-5 fade-up">
        {/* Business profile */}
        <form onSubmit={save}>
          <SectionCard title="Perfil del negocio">
            <div className="space-y-4">
              {PROFILE.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  {f.textarea
                    ? <Textarea value={settings[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} rows={3} />
                    : <Input value={settings[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />}
                </Field>
              ))}
              <Button>Guardar perfil</Button>
            </div>
          </SectionCard>
        </form>

        <DangerZone />
        </div>
        )}

        {/* ── Plan / facturación ── */}
        {tab === 'plan' && <div className="fade-up"><PlanTab toast={toast} /></div>}

        {/* ── Pagos ── */}
        {tab === 'pagos' && (
        <div className="space-y-5 fade-up">
        {/* Payments identity */}
        <form onSubmit={save}>
          <SectionCard title="Pagos (Yape / Plin)" desc="WABOS compara los comprobantes de tus clientes contra estos datos.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { key: 'payments_yape_name', label: 'Nombre en Yape', hint: 'Tal como aparece al yapear' },
                { key: 'payments_yape_phone', label: 'Número Yape', hint: 'Ej. 987654321' },
                { key: 'payments_plin_name', label: 'Nombre en Plin' },
                { key: 'payments_plin_phone', label: 'Número Plin' },
              ].map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input value={settings[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                </Field>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-fg"><Wallet size={14} /> Confirmación automática</div>
                <p className="text-xs text-muted">⚠️ La IA lee el comprobante pero no confirma que el dinero llegó. Desactivado, todo pasa por tu revisión.</p>
              </div>
              <Switch checked={settings.payments_auto_confirm === '1'} onChange={(v) => set('payments_auto_confirm', v ? '1' : '0')} label="Auto-confirmar" />
            </div>
            <div className="mt-4"><Button>Guardar pagos</Button></div>
          </SectionCard>
        </form>

        {/* Bank verification */}
        <form onSubmit={save}>
          <SectionCard title="Verificación bancaria (anti-fraude)"
            actions={<span className="inline-flex items-center gap-1 text-xs text-brand"><ShieldCheck size={13} /> ground truth</span>}>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-fg">Exigir cruce con notificación real del banco</div>
                <p className="text-xs text-muted">Recomendado. Un pago solo se confirma si el comprobante coincide con la notificación real de Yape/Plin (monto + N° de operación). Una captura falsa nunca se aprueba sola.</p>
              </div>
              <Switch checked={settings.payments_require_bank_match !== '0'} onChange={(v) => set('payments_require_bank_match', v ? '1' : '0')} label="Exigir cruce" />
            </div>

            <div className="mt-4">
              <Field label="Fuente de notificaciones" hint="De dónde WABOS obtiene los avisos reales de pago.">
                <Select value={settings.payments_ground_truth_source ?? 'off'} onChange={(e) => set('payments_ground_truth_source', e.target.value)}>
                  <option value="off">Ninguna (todo pasa a revisión manual)</option>
                  <option value="email">Correo (sin instalar nada) — recomendado</option>
                  <option value="webhook">Webhook (app reenviadora / tercero)</option>
                </Select>
              </Field>
            </div>

            {settings.payments_ground_truth_source === 'email' && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
                <p className="text-xs text-muted sm:col-span-2">Activa en Yape/Plin el aviso por correo (mínimo S/10) apuntando a esta bandeja. WABOS la lee y cruza los pagos.</p>
                {[
                  { key: 'payments_imap_host', label: 'Servidor IMAP', hint: 'ej. imap.gmail.com' },
                  { key: 'payments_imap_port', label: 'Puerto', hint: '993' },
                  { key: 'payments_imap_user', label: 'Correo (usuario)' },
                  { key: 'payments_imap_pass', label: 'Contraseña de aplicación', hint: 'no tu contraseña normal' },
                ].map((f) => (
                  <Field key={f.key} label={f.label} hint={f.hint}>
                    <Input type={f.key === 'payments_imap_pass' ? 'password' : 'text'} value={settings[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            )}

            {settings.payments_ground_truth_source === 'webhook' && (
              <div className="mt-3 rounded-xl bg-surface-2 p-3">
                <Field label="Secreto del webhook" hint="Envía las notificaciones a POST /api/webhooks/payment con el header x-wabos-secret.">
                  <Input value={settings.payments_webhook_secret ?? ''} onChange={(e) => set('payments_webhook_secret', e.target.value)} placeholder="un secreto largo y aleatorio" />
                </Field>
              </div>
            )}
            <div className="mt-4"><Button>Guardar verificación</Button></div>
          </SectionCard>
        </form>
        </div>
        )}

        {/* ── FAQs ── */}
        {tab === 'faqs' && (
        <div className="space-y-5 fade-up">
        {/* FAQs */}
        <SectionCard title="Preguntas frecuentes" desc="La IA usa estas respuestas como fuente de verdad."
          actions={<HelpCircle size={16} className="text-subtle" />}>
          <form onSubmit={addFaq} className="space-y-2">
            <Input value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder="Pregunta, ej. ¿Hacen delivery?" />
            <div className="flex gap-2">
              <Input value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} placeholder="Respuesta" className="flex-1" />
              <Button disabled={!faqForm.question || !faqForm.answer}>Agregar</Button>
            </div>
          </form>
          <div className="mt-4 space-y-2">
            {faqs.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-fg">{f.question}</div>
                  <div className="text-xs text-muted">{f.answer}</div>
                </div>
                <button onClick={() => removeFaq(f.id)} className="shrink-0 text-subtle transition hover:text-danger"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </SectionCard>
        </div>
        )}
      </div>
    </Shell>
  );
}

// Plan + billing. Shows the current tier, AI-message usage against the cap, and
// (when billing is configured) upgrade / manage-subscription actions.
const TIER_META: Record<string, { label: string; blurb: string }> = {
  free: { label: 'Prueba', blurb: 'Para explorar sin tarjeta' },
  basico: { label: 'Básico', blurb: 'Para empezar a atender mejor' },
  avanzado: { label: 'Avanzado', blurb: 'El favorito de los negocios que venden' },
  pro: { label: 'Pro', blurb: 'Para equipos y operaciones serias' },
  enterprise: { label: 'Empresarial', blurb: 'Múltiples sucursales, a tu medida' },
};

// The three self-serve plans, in upgrade order. Annual = 10× the monthly price
// (two months free), matching the marketing site. `annualPerMonth` is what to
// show as the equivalent monthly rate on the annual toggle.
const SELF_SERVE: { tier: CheckoutTier; monthly: number; annual: number; popular?: boolean }[] = [
  { tier: 'basico', monthly: 49, annual: 490 },
  { tier: 'avanzado', monthly: 89, annual: 890, popular: true },
  { tier: 'pro', monthly: 159, annual: 1590 },
];

// Where the Empresarial "Contáctanos" button points. Override per deployment.
const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL ?? 'mailto:hola@wabos.pe';

const MANAGEABLE = ['active', 'on_trial', 'past_due', 'cancelled', 'paused'];

function PlanTab({ toast }: { toast: (msg: string, tone?: 'success' | 'info' | 'error') => void }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>('month');

  const refresh = () => getStatus().then(setStatus).catch(() => {});

  // Pull the subscription from the provider then refresh — used after checkout
  // (webhook-independent) and by the manual "Actualizar" button.
  async function sync(showToast = false) {
    try { await syncBilling(); await refresh(); if (showToast) toast('Estado actualizado.', 'info'); }
    catch (err: any) { if (showToast) toast(err.message, 'error'); }
  }

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      toast('¡Suscripción activada! Confirmando…', 'success');
      // LS may take a moment to finalize; reconcile now and again shortly after.
      sync();
      const t = setTimeout(() => sync(), 4000);
      return () => clearTimeout(t);
    }
    if (params.get('billing') === 'cancelled') toast('Pago cancelado.', 'info');
  }, [toast]);

  // New subscriber → hosted checkout (redirect). Existing subscriber → change plan in place.
  async function subscribe(tier: CheckoutTier) {
    setBusy(true);
    try { await startCheckout(tier, interval); } catch (err: any) { toast(err.message, 'error'); setBusy(false); }
  }
  async function change(tier: CheckoutTier) {
    setBusy(true);
    try { await changePlan(tier, interval); toast('Plan actualizado.', 'success'); await refresh(); }
    catch (err: any) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!(await confirm({ title: 'Cancelar suscripción', message: 'Tu plan seguirá activo hasta el final del periodo ya pagado y luego bajará a la prueba gratis. Puedes reanudar antes de esa fecha.', confirmLabel: 'Cancelar suscripción', danger: true }))) return;
    setBusy(true);
    try { await cancelSubscription(); toast('Suscripción cancelada; sigue activa hasta el fin del periodo.', 'info'); await refresh(); }
    catch (err: any) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true);
    try { await resumeSubscription(); toast('Suscripción reanudada.', 'success'); await refresh(); }
    catch (err: any) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function manage() {
    setBusy(true);
    try { await openBillingPortal(); } catch (err: any) { toast(err.message, 'error'); setBusy(false); }
  }

  if (!status) return <Card className="p-5 text-sm text-muted">Cargando plan…</Card>;

  const tier = status.planTier;
  const meta = TIER_META[tier] ?? { label: tier, blurb: '' };
  const used = status.usage.aiMessages;
  const limit = status.usage.aiMessagesLimit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used >= limit;

  const sub = status.subscriptionStatus;
  const hasSub = !!sub && MANAGEABLE.includes(sub);       // has a subscription we can modify
  const cancelled = sub === 'cancelled';                   // scheduled to end at period end
  const periodEnd = status.currentPeriodEnd
    ? new Date(status.currentPeriodEnd * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/12 text-brand"><CreditCard size={18} /></span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-fg">Plan actual</span>
                <Badge tone={tier === 'free' ? 'neutral' : 'brand'}>{meta.label}</Badge>
                {sub && sub !== 'active' && <Badge tone="warn">{sub}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {cancelled && periodEnd ? `Se cancela el ${periodEnd} — reanuda para seguir.`
                  : hasSub && periodEnd ? `Se renueva el ${periodEnd}.`
                  : meta.blurb}
              </p>
            </div>
          </div>
          {status.billingAvailable && (
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => sync(true)} disabled={busy} title="Actualizar estado desde el proveedor" className="text-xs text-subtle underline-offset-2 hover:text-fg hover:underline">Actualizar</button>
              {hasSub && (cancelled
                ? <Button size="sm" onClick={resume} disabled={busy}>Reanudar</Button>
                : <button onClick={cancel} disabled={busy} className="text-xs text-subtle underline-offset-2 hover:text-danger hover:underline">Cancelar</button>)}
              {hasSub && <Button size="sm" variant="secondary" onClick={manage} disabled={busy}>Gestionar</Button>}
            </div>
          )}
        </div>

        {/* Usage meter */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted">Mensajes de IA este mes</span>
            <span className={cn('tabular font-medium', over ? 'text-danger' : 'text-fg')}>
              {used.toLocaleString('es-PE')}{limit != null ? ` / ${limit.toLocaleString('es-PE')}` : ' · ilimitado'}
            </span>
          </div>
          {limit != null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div className={cn('h-full rounded-full transition-all', over ? 'bg-danger' : 'bg-brand')} style={{ width: `${pct}%` }} />
            </div>
          )}
          {over && <p className="mt-2 text-xs text-danger">Alcanzaste el límite: la IA dejó de responder automáticamente. Actualiza tu plan para reactivarla.</p>}
        </div>
      </Card>

      {status.billingAvailable ? (
        <>
        {/* Monthly / annual toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {([['month', 'Mensual'], ['year', 'Anual · 2 meses gratis']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setInterval(v)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition', interval === v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SELF_SERVE.map(({ tier: t, monthly, annual, popular }) => {
            const price = interval === 'year' ? annual : monthly;
            const perMonth = Math.round(annual / 12);
            return (
            <Card key={t} className={cn('flex flex-col gap-3 p-5', popular && 'border-brand/40')}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{TIER_META[t].label}</span>
                  {tier === t ? <Badge tone="brand"><Check size={11} /> Actual</Badge>
                    : popular ? <Badge tone="brand">Más popular</Badge> : null}
                </div>
                <p className="mt-1 text-xl font-semibold text-fg">S/{price}<span className="text-xs font-normal text-subtle">{interval === 'year' ? ' /año' : ' /mes'}</span></p>
                {interval === 'year' && <p className="text-[11px] text-brand">≈ S/{perMonth}/mes · ahorras 2 meses</p>}
                <p className="mt-0.5 text-xs text-muted">{TIER_META[t].blurb}</p>
              </div>
              {tier === t ? (
                cancelled
                  ? <Button className="mt-auto w-full" disabled={busy} onClick={resume}>Reanudar</Button>
                  : <Button className="mt-auto w-full" variant="secondary" disabled>Plan actual</Button>
              ) : (
                <Button className="mt-auto w-full" disabled={busy} onClick={() => (hasSub ? change(t) : subscribe(t))}>
                  {hasSub ? `Cambiar a ${TIER_META[t].label}` : `Suscribirme a ${TIER_META[t].label}`}
                </Button>
              )}
            </Card>
            );
          })}
          {/* Enterprise is contact-us — set up manually, no self-serve checkout. */}
          <Card className="flex flex-col gap-3 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg">{TIER_META.enterprise.label}</span>
                {tier === 'enterprise' && <Badge tone="brand"><Check size={11} /> Actual</Badge>}
              </div>
              <p className="mt-1 text-xl font-semibold text-fg">A tu medida</p>
              <p className="mt-0.5 text-xs text-muted">{TIER_META.enterprise.blurb}</p>
            </div>
            <a href={CONTACT_URL} className="mt-auto"><Button variant="secondary" className="w-full">Contáctanos</Button></a>
          </Card>
        </div>
        </>
      ) : (
        <Card className="p-5 text-sm text-muted">
          El cobro con tarjeta aún no está configurado en este entorno. Configura las claves de facturación para habilitar las suscripciones.
        </Card>
      )}
    </div>
  );
}

// Permanent account + data deletion. Irreversible, so it's gated behind a
// destructive confirm and lives at the bottom of the profile tab.
function DangerZone() {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: 'Eliminar cuenta',
      message: 'Se eliminarán permanentemente tu cuenta y TODOS los datos de tu negocio: catálogo, contactos, chats, agentes, base de conocimiento y la conexión de WhatsApp. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar todo',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAccount();
      router.replace('/register');
    } catch (err: any) {
      toast(err?.message ?? 'No se pudo eliminar la cuenta', 'error');
      setBusy(false);
    }
  }

  return (
    <Card className="border-danger/30 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><AlertTriangle size={18} /></span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">Eliminar cuenta</h3>
          <p className="mt-0.5 text-sm text-muted">Borra tu cuenta y todos los datos de tu negocio de forma permanente. No se puede deshacer.</p>
          <Button variant="danger" className="mt-4" onClick={remove} disabled={busy}>
            <Trash2 size={15} /> {busy ? 'Eliminando…' : 'Eliminar mi cuenta'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
