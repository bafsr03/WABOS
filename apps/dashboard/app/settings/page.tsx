'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Sparkles, Wallet, ShieldCheck, HelpCircle, Trash2, AlertTriangle, Store, Wand2, CreditCard, Check, type LucideIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { api, deleteAccount, getStatus, startCheckout, openBillingPortal, type Status } from '@/lib/api';
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
  free: { label: 'Free', blurb: 'Para empezar' },
  pro: { label: 'Pro', blurb: 'Para negocios en crecimiento' },
  enterprise: { label: 'Enterprise', blurb: 'Volumen alto, sin límites' },
};

function PlanTab({ toast }: { toast: (msg: string, tone?: 'success' | 'info' | 'error') => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') toast('¡Suscripción activada! Puede tardar unos segundos en reflejarse.', 'success');
    if (params.get('billing') === 'cancelled') toast('Pago cancelado.', 'info');
  }, [toast]);

  async function upgrade(tier: 'pro' | 'enterprise') {
    setBusy(true);
    try { await startCheckout(tier); } catch (err: any) { toast(err.message, 'error'); setBusy(false); }
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
                {status.subscriptionStatus && status.subscriptionStatus !== 'active' && (
                  <Badge tone="warn">{status.subscriptionStatus}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{meta.blurb}</p>
            </div>
          </div>
          {status.billingAvailable && status.subscriptionStatus && (
            <Button size="sm" variant="secondary" onClick={manage} disabled={busy}>Gestionar</Button>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(['pro', 'enterprise'] as const).map((t) => (
            <Card key={t} className="flex flex-col gap-3 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{TIER_META[t].label}</span>
                  {tier === t && <Badge tone="brand"><Check size={11} /> Actual</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{TIER_META[t].blurb}</p>
              </div>
              <Button className="mt-auto w-full" disabled={busy || tier === t} onClick={() => upgrade(t)}>
                {tier === t ? 'Plan actual' : `Cambiar a ${TIER_META[t].label}`}
              </Button>
            </Card>
          ))}
        </div>
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
