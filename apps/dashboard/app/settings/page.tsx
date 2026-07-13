'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

interface Faq { id: number; question: string; answer: string }

const FIELDS: { key: string; label: string; hint?: string; textarea?: boolean }[] = [
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
  const [saved, setSaved] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const load = useCallback(() => {
    api<Record<string, any>>('/api/settings').then((s) => {
      setAiAvailable(Boolean(s._aiAvailable));
      delete s._aiAvailable;
      setSettings(s);
    }).catch(() => {});
    api<Faq[]>('/api/faqs').then(setFaqs).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="mt-1 text-sm text-slate-500">Perfil del negocio y configuración del Empleado IA.</p>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="font-medium">Empleado IA</div>
            <p className="text-xs text-slate-500">
              {aiAvailable
                ? 'Responde automáticamente las conversaciones en modo IA.'
                : '⚠️ Sin ANTHROPIC_API_KEY en el motor la IA no puede responder.'}
            </p>
          </div>
          <button
            onClick={async () => {
              const next = aiEnabled ? '0' : '1';
              const updated = { ...settings, ai_enabled: next };
              setSettings(updated);
              await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ai_enabled: next }) });
            }}
            className={`relative h-7 w-12 rounded-full transition ${aiEnabled ? 'bg-wa' : 'bg-slate-300'}`}
            aria-label="Activar o desactivar IA"
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${aiEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-medium">Modelo del Empleado IA</div>
          <p className="text-xs text-slate-500">
            <b>Calidad</b> (Sonnet 5) da las mejores respuestas de venta. <b>Ahorro</b> (Haiku 4.5) cuesta ~3× menos,
            ideal para planes básicos. El costo baja aún más con el caché de contexto (ya activado).
          </p>
          <select
            value={settings.ai_model || 'claude-sonnet-5'}
            onChange={async (e) => {
              const v = e.target.value;
              setSettings({ ...settings, ai_model: v });
              await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ai_model: v }) });
            }}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          >
            <option value="claude-sonnet-5">Calidad — Claude Sonnet 5</option>
            <option value="claude-haiku-4-5">Ahorro — Claude Haiku 4.5</option>
          </select>
        </div>

        <form onSubmit={save} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Perfil del negocio</h2>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium">{f.label}</label>
              {f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}
              {f.textarea ? (
                <textarea
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
                />
              ) : (
                <input
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
                />
              )}
            </div>
          ))}
          <button className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white">
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </form>

        <form onSubmit={save} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Pagos (Yape / Plin)</h2>
          <p className="text-xs text-slate-500">
            WABOS compara los comprobantes que envían tus clientes contra estos datos.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'payments_yape_name', label: 'Nombre en Yape', hint: 'Tal como aparece al yapear, ej. Maria F. Quispe A.' },
              { key: 'payments_yape_phone', label: 'Número Yape', hint: 'Ej. 987654321' },
              { key: 'payments_plin_name', label: 'Nombre en Plin' },
              { key: 'payments_plin_phone', label: 'Número Plin' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium">{f.label}</label>
                {f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}
                <input
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Confirmación automática de pagos</div>
              <p className="text-xs text-slate-500">
                ⚠️ La IA lee el comprobante pero no confirma que el dinero llegó a tu cuenta.
                Desactivado, todo comprobante pasa por tu revisión.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, payments_auto_confirm: settings.payments_auto_confirm === '1' ? '0' : '1' })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings.payments_auto_confirm === '1' ? 'bg-wa' : 'bg-slate-300'}`}
              aria-label="Activar o desactivar confirmación automática"
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.payments_auto_confirm === '1' ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <button className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white">
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </form>

        <form onSubmit={save} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Verificación bancaria (anti-fraude)</h2>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Exigir cruce con notificación real del banco</div>
              <p className="text-xs text-slate-500">
                Recomendado. Un pago solo se confirma solo si el comprobante coincide con la
                notificación real de Yape/Plin (monto + N° de operación). Así una captura falsa nunca se aprueba sola.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, payments_require_bank_match: settings.payments_require_bank_match === '0' ? '1' : '0' })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings.payments_require_bank_match !== '0' ? 'bg-wa' : 'bg-slate-300'}`}
              aria-label="Exigir cruce bancario"
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.payments_require_bank_match !== '0' ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium">Fuente de notificaciones</label>
            <p className="text-xs text-slate-400">De dónde WABOS obtiene los avisos reales de pago.</p>
            <select
              value={settings.payments_ground_truth_source ?? 'off'}
              onChange={(e) => setSettings({ ...settings, payments_ground_truth_source: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
            >
              <option value="off">Ninguna (todo pasa a revisión manual)</option>
              <option value="email">Correo (sin instalar nada) — recomendado</option>
              <option value="webhook">Webhook (app reenviadora / tercero)</option>
            </select>
          </div>

          {settings.payments_ground_truth_source === 'email' && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
              <p className="col-span-2 text-xs text-slate-500">
                Activa en Yape/Plin el aviso por correo (mínimo S/10) apuntando a esta bandeja. WABOS la lee y cruza los pagos.
              </p>
              {[
                { key: 'payments_imap_host', label: 'Servidor IMAP', hint: 'ej. imap.gmail.com' },
                { key: 'payments_imap_port', label: 'Puerto', hint: '993' },
                { key: 'payments_imap_user', label: 'Correo (usuario)' },
                { key: 'payments_imap_pass', label: 'Contraseña de aplicación', hint: 'no tu contraseña normal' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium">{f.label}</label>
                  {f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}
                  <input
                    type={f.key === 'payments_imap_pass' ? 'password' : 'text'}
                    value={settings[f.key] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {settings.payments_ground_truth_source === 'webhook' && (
            <div className="rounded-lg bg-slate-50 p-3">
              <label className="block text-sm font-medium">Secreto del webhook</label>
              <p className="text-xs text-slate-400">
                Envía las notificaciones a <code className="rounded bg-slate-200 px-1">POST /api/webhooks/payment</code> con el header <code className="rounded bg-slate-200 px-1">x-wabos-secret</code>.
              </p>
              <input
                value={settings.payments_webhook_secret ?? ''}
                onChange={(e) => setSettings({ ...settings, payments_webhook_secret: e.target.value })}
                placeholder="un secreto largo y aleatorio"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
              />
            </div>
          )}
          <button className="rounded-lg bg-wa-dark px-5 py-2 text-sm font-medium text-white">
            {saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Preguntas frecuentes</h2>
          <p className="text-xs text-slate-500">La IA usa estas respuestas como fuente de verdad.</p>
          <form onSubmit={addFaq} className="mt-3 space-y-2">
            <input
              value={faqForm.question}
              onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
              placeholder="Pregunta, ej. ¿Hacen delivery?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
            />
            <div className="flex gap-2">
              <input
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                placeholder="Respuesta"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
              />
              <button
                disabled={!faqForm.question || !faqForm.answer}
                className="rounded-lg bg-wa-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </form>
          <div className="mt-4 space-y-2">
            {faqs.map((f) => (
              <div key={f.id} className="flex items-start justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{f.question}</div>
                  <div className="text-xs text-slate-500">{f.answer}</div>
                </div>
                <button onClick={() => removeFaq(f.id)} className="ml-3 shrink-0 text-xs text-red-400 hover:text-red-600">
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
