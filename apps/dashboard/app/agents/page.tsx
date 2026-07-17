'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Bot, Check, ChevronRight, Star, Settings, Sparkles, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, startAgentTest } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PageHeader, Card, Input, Textarea, Field, Button, Badge, EmptyState } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Agent {
  id: number;
  name: string;
  slug: string;
  description: string;
  persona: string;
  ai_tone: string;
  ai_instructions: string;
  model_default: string;
  model_sales: string;
  is_default: number;
  enabled: number;
}

type View = { mode: 'list' } | { mode: 'edit'; agent: Agent | null };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [testing, setTesting] = useState<number | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(() => { api<Agent[]>('/api/agents').then(setAgents).catch(() => {}); }, []);
  useEffect(load, [load]);

  // Spin up (or reset) a test conversation for this agent and jump to the Inbox
  // to chat with it — no real WhatsApp needed.
  async function test(a: Agent) {
    if (testing) return;
    setTesting(a.id);
    try {
      const { conversationId } = await startAgentTest(a.id);
      router.push(`/inbox?c=${conversationId}`);
    } catch (err: any) {
      toast(err.message, 'error');
      setTesting(null);
    }
  }

  async function remove(a: Agent, back = false) {
    if (!(await confirm({ title: 'Eliminar agente', message: `Se eliminará "${a.name}". Las conversaciones asignadas volverán al agente por defecto.`, confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await api(`/api/agents/${a.id}`, { method: 'DELETE' });
      toast('Agente eliminado', 'info');
      load();
      if (back) setView({ mode: 'list' });
    } catch (err: any) { toast(err.message, 'error'); }
  }

  return (
    <Shell>
      {view.mode === 'list' ? (
        <ListView
          agents={agents}
          testing={testing}
          onNew={() => setView({ mode: 'edit', agent: null })}
          onOpen={(a) => setView({ mode: 'edit', agent: a })}
          onDelete={(a) => remove(a)}
          onTest={test}
        />
      ) : (
        <EditorView
          agent={view.agent}
          testing={testing}
          onClose={() => setView({ mode: 'list' })}
          onSaved={() => { load(); setView({ mode: 'list' }); }}
          onDelete={(a) => remove(a, true)}
          onTest={test}
          toast={toast}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ List */

function ListView({ agents, testing, onNew, onOpen, onDelete, onTest }: {
  agents: Agent[];
  testing: number | null;
  onNew: () => void;
  onOpen: (a: Agent) => void;
  onDelete: (a: Agent) => void;
  onTest: (a: Agent) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <PageHeader
        title="Agentes IA"
        subtitle="Crea agentes con tareas dedicadas (Ventas, Soporte, Envíos). Se derivan las conversaciones entre sí según lo que necesita el cliente."
        actions={<Button onClick={onNew}><Plus size={15} /> Nuevo agente</Button>}
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot size={24} />}
          title="Sin agentes"
          desc="Crea tu primer agente especializado."
          action={<Button onClick={onNew}><Plus size={15} /> Nuevo agente</Button>}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {agents.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(a)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(a); }}
              className="group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2"
            >
              <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl border', a.is_default ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border bg-surface-2 text-subtle')}>
                <Bot size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn('truncate text-sm font-medium text-fg', !a.enabled && 'opacity-60')}>{a.name}</p>
                  {a.is_default ? <Badge tone="brand"><Star size={11} /> Por defecto</Badge> : null}
                  {!a.enabled ? <Badge tone="neutral">Desactivado</Badge> : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{a.description || <span className="text-subtle">Sin descripción de derivación</span>}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onTest(a); }}
                disabled={testing === a.id}
                title="Probar agente"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle opacity-0 transition hover:bg-brand/12 hover:text-brand group-hover:opacity-100 disabled:opacity-50"
              >
                <FlaskConical size={15} />
              </button>
              {!a.is_default && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(a); }}
                  title="Eliminar"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-subtle opacity-0 transition hover:bg-danger/12 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <ChevronRight size={16} className="shrink-0 text-subtle" />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Editor */

function EditorView({ agent, testing, onClose, onSaved, onDelete, onTest, toast }: {
  agent: Agent | null;
  testing: number | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (a: Agent) => void;
  onTest: (a: Agent) => void;
  toast: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}) {
  const isNew = !agent;
  const isDefault = !!agent?.is_default;
  const [name, setName] = useState(agent?.name ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [persona, setPersona] = useState(agent?.persona ?? '');
  const [tone, setTone] = useState(agent?.ai_tone ?? '');
  const [instructions, setInstructions] = useState(agent?.ai_instructions ?? '');
  const [enabled, setEnabled] = useState(agent ? !!agent.enabled : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    // The default agent's tone/instructions live in Ajustes, so don't send them.
    const payload: Record<string, unknown> = { name: name.trim(), description: description.trim(), persona: persona.trim() };
    if (!isDefault) {
      payload.ai_tone = tone.trim();
      payload.ai_instructions = instructions.trim();
      payload.enabled = enabled;
    }
    try {
      if (isNew) {
        await api('/api/agents', { method: 'POST', body: JSON.stringify(payload) });
        toast('Agente creado', 'success');
      } else {
        await api(`/api/agents/${agent!.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Cambios guardados', 'success');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur lg:px-8">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <span className="truncate text-sm font-medium text-fg">{isNew ? 'Nuevo agente' : `Editar ${agent!.name}`}</span>
        <Button size="sm" onClick={save} disabled={!name.trim() || saving}>
          <Check size={15} /> {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      <div className="space-y-5 p-6 lg:p-8">
        {!isNew && (
          <Card className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium text-fg">Estado del agente</p>
              <p className="mt-0.5 text-xs text-muted">{isDefault ? 'El agente por defecto siempre está activo.' : 'Los agentes desactivados no atienden ni reciben derivaciones.'}</p>
            </div>
            {isDefault ? (
              <Badge tone="brand"><Star size={11} /> Por defecto</Badge>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
                {[{ v: true, l: 'Activo' }, { v: false, l: 'Inactivo' }].map((o) => (
                  <button key={o.l} onClick={() => setEnabled(o.v)}
                    className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition', enabled === o.v ? 'bg-surface text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg')}>
                    {o.l}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card className="space-y-4 p-4">
          <Field label="Nombre del agente">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ventas, Soporte, Envíos" autoFocus />
          </Field>
          <Field label="¿Cuándo debe atender este agente?" hint="Otros agentes leen esto para saber cuándo derivarle la conversación.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ej. Consultas de compra, precios y stock del catálogo." />
          </Field>
          <Field label="Personalidad / rol" hint="Opcional. Describe el rol o carácter del agente.">
            <Textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} placeholder="Ej. Eres un asesor de ventas entusiasta y directo." />
          </Field>
        </Card>

        {isDefault ? (
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-fg"><Sparkles size={15} className="text-brand" /> Tono y voz</div>
            <p className="text-xs text-muted">El tono, las instrucciones y el ADN de voz del agente por defecto se gestionan en Ajustes y en ADN de voz.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings"><Button variant="secondary" size="sm"><Settings size={14} /> Ir a Ajustes</Button></Link>
              <Link href="/voice"><Button variant="secondary" size="sm"><Sparkles size={14} /> ADN de voz</Button></Link>
            </div>
          </Card>
        ) : (
          <Card className="space-y-4 p-4">
            <Field label="Tono" hint="Cómo se comunica este agente.">
              <Textarea value={tone} onChange={(e) => setTone(e.target.value)} rows={2} placeholder="Ej. Cercano, claro y profesional. Responde en español." />
            </Field>
            <Field label="Instrucciones" hint="Reglas específicas para este agente.">
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Ej. Nunca ofrezcas descuentos. Deriva a Ventas si el cliente quiere comprar." />
            </Field>
          </Card>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {!isNew && (
          <Button variant="secondary" className="w-full" disabled={testing === agent!.id} onClick={() => onTest(agent!)}>
            <FlaskConical size={15} /> Probar agente en el Inbox
          </Button>
        )}

        {!isNew && !isDefault && (
          <Button variant="danger" className="w-full" onClick={() => onDelete(agent!)}>
            <Trash2 size={15} /> Eliminar agente
          </Button>
        )}
      </div>
    </div>
  );
}
