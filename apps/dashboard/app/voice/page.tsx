'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Wand2, MessageSquareQuote, Tag, Check, Lock } from 'lucide-react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { connectWs } from '@/lib/ws';
import { PageHeader, Card, SectionCard, Button, Badge, Spinner, EmptyState, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';

interface AgentLite { id: number; name: string; is_default: number; enabled: number }

interface VoiceProfile {
  voice_summary?: string;
  tone?: string[];
  formality?: string;
  avg_length?: string;
  length_mix?: { short: number; medium: number; long: number };
  emoji_usage?: string;
  greetings?: string[];
  signoffs?: string[];
  signature_phrases?: string[];
  languages?: string[];
  do?: string[];
  dont?: string[];
  suggested_tone?: string;
  suggested_instructions?: string;
}
interface Analysis {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  conversations_total: number;
  conversations_done: number;
  messages_analyzed: number;
  contacts_tagged: number;
  source: 'human' | 'all';
  profile: VoiceProfile | null;
  error: string | null;
  applied_at: number | null;
}

export default function VoicePage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [aiAvailable, setAiAvailable] = useState<boolean>(true);
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [targetAgent, setTargetAgent] = useState<string>('default');
  const toast = useToast();

  const load = useCallback(() => {
    api<Analysis | null>('/api/style/latest').then(setAnalysis).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ features?: Record<string, boolean>; aiAvailable?: boolean }>('/api/status')
      .then((s) => { setEnabled(s.features?.style_analysis ?? true); setAiAvailable(Boolean(s.aiAvailable)); })
      .catch(() => {});
    api<AgentLite[]>('/api/agents').then(setAgents).catch(() => {});
    load();
    return connectWs((event) => { if (event.type === 'style.progress') load(); });
  }, [load]);

  // Custom (non-default) agents can each receive their own learned voice.
  const customAgents = agents.filter((a) => !a.is_default);

  const running = analysis?.status === 'queued' || analysis?.status === 'running';

  async function start() {
    setStarting(true);
    try {
      const created = await api<Analysis>('/api/style/analyze', { method: 'POST', body: JSON.stringify({}) });
      setAnalysis(created);
      toast('Análisis iniciado', 'success');
    } catch (err: any) { toast(err.message, 'error'); } finally { setStarting(false); }
  }

  async function apply() {
    if (!analysis) return;
    setApplying(true);
    // 'default' → the business default agent (writes settings); a numeric id → a
    // specific custom agent.
    const body = targetAgent === 'default' ? {} : { agentId: Number(targetAgent) };
    try {
      const updated = await api<Analysis>(`/api/style/${analysis.id}/apply`, { method: 'POST', body: JSON.stringify(body) });
      setAnalysis(updated);
      const label = targetAgent === 'default' ? 'al Empleado IA' : `a ${customAgents.find((a) => String(a.id) === targetAgent)?.name ?? 'el agente'}`;
      toast(`Voz aplicada ${label}`, 'success');
    } catch (err: any) { toast(err.message, 'error'); } finally { setApplying(false); }
  }

  const p = analysis?.profile;
  const pct = analysis?.conversations_total ? (analysis.conversations_done / analysis.conversations_total) * 100 : 0;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <PageHeader
          title="ADN de voz"
          subtitle="La IA lee tu historial de WhatsApp para aprender cómo escribe tu negocio y etiquetar a tus contactos."
          actions={enabled && aiAvailable ? (
            <Button onClick={start} disabled={starting || running}>
              <Wand2 size={15} /> {running ? 'Analizando…' : starting ? 'Iniciando…' : analysis?.status === 'done' ? 'Volver a analizar' : 'Analizar mi estilo'}
            </Button>
          ) : undefined}
        />

        {!enabled ? (
          <EmptyState icon={<Lock size={24} />} title="Función premium" desc="El análisis de estilo con IA está disponible en el plan Pro. Actualiza para desbloquearlo." tall />
        ) : !aiAvailable ? (
          <EmptyState icon={<Sparkles size={24} />} title="IA no configurada" desc="Configura ANTHROPIC_API_KEY en el motor para usar esta función." tall />
        ) : !analysis ? (
          <EmptyState
            icon={<Sparkles size={24} />}
            title="Aún no has analizado tu estilo"
            desc="Con un clic, la IA revisa tus conversaciones, aprende tu voz y etiqueta a tus clientes."
            action={<Button onClick={start} disabled={starting}><Wand2 size={15} /> Analizar mi estilo</Button>}
            tall
          />
        ) : (
          <div className="space-y-5">
            {/* Progress / status */}
            {running && (
              <Card className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-fg"><Spinner className="h-4 w-4" /> Analizando tus conversaciones…</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full brand-gradient" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut' }} />
                </div>
                <p className="tabular mt-1.5 text-xs text-subtle">
                  {analysis.conversations_done}/{analysis.conversations_total} conversaciones · {analysis.messages_analyzed} mensajes · {analysis.contacts_tagged} contactos etiquetados
                </p>
              </Card>
            )}

            {analysis.status === 'failed' && (
              <Card className="p-5">
                <Badge tone="danger">Falló</Badge>
                <p className="mt-2 text-sm text-muted">{analysis.error ?? 'Ocurrió un error durante el análisis.'}</p>
                <Button className="mt-3" variant="secondary" onClick={start} disabled={starting}><Wand2 size={15} /> Reintentar</Button>
              </Card>
            )}

            {analysis.status === 'done' && p && (
              <>
                <SectionCard
                  title="Tu voz"
                  desc={`Aprendida de ${analysis.conversations_total} conversaciones · ${analysis.contacts_tagged} contactos etiquetados${analysis.source === 'all' ? ' · pocas respuestas humanas: se incluyeron respuestas de la IA' : ''}`}
                  actions={
                    customAgents.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Select value={targetAgent} onChange={(e) => setTargetAgent(e.target.value)} className="w-auto min-w-[9rem]">
                          <option value="default">Empleado IA (por defecto)</option>
                          {customAgents.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                        </Select>
                        <Button onClick={apply} disabled={applying}><Check size={15} /> {applying ? 'Aplicando…' : 'Aplicar'}</Button>
                      </div>
                    ) : analysis.applied_at
                      ? <Badge tone="success" dot><Check size={12} /> Aplicada al Empleado IA</Badge>
                      : <Button onClick={apply} disabled={applying}><Check size={15} /> {applying ? 'Aplicando…' : 'Aplicar al Empleado IA'}</Button>
                  }
                >
                  {p.voice_summary && <p className="text-sm text-fg">{p.voice_summary}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(p.tone ?? []).map((t) => <Badge key={t} tone="brand">{t}</Badge>)}
                    {(p.languages ?? []).map((l) => <Badge key={l} tone="info">{l}</Badge>)}
                    {p.formality && <Badge tone="neutral">{p.formality}</Badge>}
                  </div>
                  {(p.avg_length || p.emoji_usage) && (
                    <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                      {p.avg_length && <div><span className="font-medium text-fg">Longitud:</span> {p.avg_length}</div>}
                      {p.emoji_usage && <div><span className="font-medium text-fg">Emojis:</span> {p.emoji_usage}</div>}
                    </div>
                  )}
                </SectionCard>

                {(p.signature_phrases?.length || p.greetings?.length || p.signoffs?.length) ? (
                  <SectionCard title="Frases y saludos" desc="Expresiones reales que usa tu negocio.">
                    <ChipGroup icon={<MessageSquareQuote size={13} />} label="Saludos" items={p.greetings} />
                    <ChipGroup icon={<MessageSquareQuote size={13} />} label="Despedidas" items={p.signoffs} />
                    <ChipGroup icon={<MessageSquareQuote size={13} />} label="Frases típicas" items={p.signature_phrases} />
                  </SectionCard>
                ) : null}

                {(p.do?.length || p.dont?.length) ? (
                  <SectionCard title="Guía de estilo">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <RuleList title="Sí" tone="success" items={p.do} />
                      <RuleList title="No" tone="danger" items={p.dont} />
                    </div>
                  </SectionCard>
                ) : null}

                {analysis.contacts_tagged > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-subtle">
                    <Tag size={13} /> Se etiquetaron {analysis.contacts_tagged} contactos. Revísalos en Contactos.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function ChipGroup({ icon, label, items }: { icon: React.ReactNode; label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-subtle">{icon} {label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s, i) => <span key={i} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-fg">{s}</span>)}
      </div>
    </div>
  );
}

function RuleList({ title, tone, items }: { title: string; tone: 'success' | 'danger'; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <Badge tone={tone}>{title}</Badge>
      <ul className="mt-2 space-y-1.5 text-sm text-muted">
        {items.map((s, i) => <li key={i} className="flex gap-2"><span className="text-subtle">•</span>{s}</li>)}
      </ul>
    </div>
  );
}
