import { one, many, none } from '../db/index.js';
import { bus } from '../events.js';
import { currentBusinessId } from '../context.js';
import { getConversation } from './store.js';

// Multi-agent layer. Every query is scoped to the current business context, so a
// business only ever sees and routes among its own agents.

export interface Agent {
  id: number;
  business_id: number;
  name: string;
  slug: string;
  description: string;
  persona: string;
  ai_tone: string;
  ai_instructions: string;
  communication_profile: string | null;
  model_default: string;
  model_sales: string;
  is_default: number;
  enabled: number;
  created_at: number;
}

export interface RoutableAgent {
  id: number;
  slug: string;
  name: string;
  description: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'agente';
}

// Ensure a slug is unique within the business by suffixing -2, -3, … as needed.
async function uniqueSlug(base: string, businessId: number, excludeId?: number): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const clash = await one('SELECT id FROM agents WHERE business_id = $1 AND slug = $2 AND id <> $3',
      [businessId, slug, excludeId ?? -1]);
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function listAgents(): Promise<Agent[]> {
  return many<Agent>('SELECT * FROM agents WHERE business_id = $1 ORDER BY is_default DESC, name', [currentBusinessId()]);
}

export async function getAgent(id: number): Promise<Agent | undefined> {
  return one<Agent>('SELECT * FROM agents WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
}

export async function getDefaultAgent(): Promise<Agent | undefined> {
  return one<Agent>('SELECT * FROM agents WHERE business_id = $1 AND is_default = 1 LIMIT 1', [currentBusinessId()]);
}

// The agent that should answer a conversation: its assigned agent when set and
// still enabled, otherwise the business default. Never returns a disabled agent.
export async function resolveAgentForConversation(conversationId: number): Promise<Agent | undefined> {
  const convo = await getConversation(conversationId);
  if (convo && (convo as any).agent_id) {
    const assigned = await getAgent((convo as any).agent_id);
    if (assigned && assigned.enabled) return assigned;
  }
  return getDefaultAgent();
}

// Enabled siblings an agent can hand off to (everyone in the business except
// itself). Feeds the route_to_agent tool's schema + description.
export async function getRoutableAgents(excludeAgentId: number): Promise<RoutableAgent[]> {
  return many<RoutableAgent>(`
    SELECT id, slug, name, description FROM agents
    WHERE business_id = $1 AND enabled = 1 AND id <> $2
    ORDER BY name
  `, [currentBusinessId(), excludeAgentId]);
}

export async function setConversationAgent(conversationId: number, agentId: number): Promise<void> {
  await none('UPDATE conversations SET agent_id = $1 WHERE id = $2 AND business_id = $3',
    [agentId, conversationId, currentBusinessId()]);
  bus.emitEvent({ type: 'conversation.updated', conversation: await getConversation(conversationId) });
}

export interface AgentInput {
  name: string;
  slug?: string;
  description?: string;
  persona?: string;
  ai_tone?: string;
  ai_instructions?: string;
  model_default?: string;
  model_sales?: string;
  enabled?: boolean;
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  const businessId = currentBusinessId();
  const slug = await uniqueSlug(input.slug ? slugify(input.slug) : slugify(input.name), businessId);
  const row = await one<Agent>(`
    INSERT INTO agents (business_id, name, slug, description, persona, ai_tone, ai_instructions, model_default, model_sales, is_default, enabled)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
    RETURNING *
  `, [
    businessId, input.name, slug,
    input.description ?? '', input.persona ?? '',
    input.ai_tone ?? '', input.ai_instructions ?? '',
    input.model_default ?? '', input.model_sales ?? '',
    input.enabled === false ? 0 : 1,
  ]);
  return row!;
}

export async function updateAgent(id: number, patch: Partial<AgentInput>): Promise<Agent | undefined> {
  const current = await getAgent(id);
  if (!current) return undefined;
  const slug = patch.slug !== undefined
    ? await uniqueSlug(slugify(patch.slug), current.business_id, id)
    : current.slug;
  await none(`
    UPDATE agents SET name = $1, slug = $2, description = $3, persona = $4, ai_tone = $5,
      ai_instructions = $6, model_default = $7, model_sales = $8, enabled = $9
    WHERE id = $10 AND business_id = $11
  `, [
    patch.name ?? current.name,
    slug,
    patch.description ?? current.description,
    patch.persona ?? current.persona,
    patch.ai_tone ?? current.ai_tone,
    patch.ai_instructions ?? current.ai_instructions,
    patch.model_default ?? current.model_default,
    patch.model_sales ?? current.model_sales,
    patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0,
    id, current.business_id,
  ]);
  return getAgent(id);
}

// The default agent is the routing fallback and can't be deleted (a business
// must always have one). Conversations pointing at a deleted agent fall back to
// the default via resolveAgentForConversation.
export async function deleteAgent(id: number): Promise<{ ok: boolean; error?: string }> {
  const agent = await getAgent(id);
  if (!agent) return { ok: false, error: 'Agent not found' };
  if (agent.is_default) return { ok: false, error: 'No se puede eliminar el agente por defecto' };
  await none('DELETE FROM agents WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  return { ok: true };
}

// Push a learned Voice DNA profile onto a specific agent (defaults to the
// business default agent). Mirrors the old settings-based apply, now per-agent.
export async function applyVoiceToAgent(
  agentId: number | undefined,
  profile: string,
  tone: string | null,
  instructions: string | null,
): Promise<Agent | undefined> {
  const agent = agentId ? await getAgent(agentId) : await getDefaultAgent();
  if (!agent) return undefined;
  await none(`
    UPDATE agents SET communication_profile = $1,
      ai_tone = COALESCE(NULLIF($2, ''), ai_tone),
      ai_instructions = COALESCE(NULLIF($3, ''), ai_instructions)
    WHERE id = $4 AND business_id = $5
  `, [profile, tone ?? '', instructions ?? '', agent.id, currentBusinessId()]);
  return getAgent(agent.id);
}
