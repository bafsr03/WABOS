import { one, none, setSetting } from '../db/index.js';
import { bus } from '../events.js';
import { currentBusinessId } from '../context.js';
import { enqueueJob, pokePoller } from '../jobs/queue.js';
import { getAgent, getDefaultAgent, applyVoiceToAgent } from './agents.js';

// State + persistence for Voice DNA runs. The heavy lifting lives in
// workers/style-worker.ts; this module is the thin CRUD + apply layer the API
// and worker share.

export interface StyleAnalysis {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  conversations_total: number;
  conversations_done: number;
  messages_analyzed: number;
  contacts_tagged: number;
  source: 'human' | 'all';
  profile: string | null;
  suggested_tone: string | null;
  suggested_instructions: string | null;
  model: string | null;
  error: string | null;
  applied_at: number | null;
  created_at: number;
  completed_at: number | null;
}

export async function getStyleAnalysis(id: number): Promise<StyleAnalysis | undefined> {
  return one<StyleAnalysis>('SELECT * FROM style_analyses WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
}

export async function getLatestStyleAnalysis(): Promise<StyleAnalysis | undefined> {
  return one<StyleAnalysis>('SELECT * FROM style_analyses WHERE business_id = $1 ORDER BY id DESC LIMIT 1', [currentBusinessId()]);
}

export async function hasActiveStyleAnalysis(): Promise<boolean> {
  const row = await one("SELECT 1 FROM style_analyses WHERE business_id = $1 AND status IN ('queued','running') LIMIT 1", [currentBusinessId()]);
  return Boolean(row);
}

// Create a run and enqueue the durable job. Returns the fresh row.
export async function createStyleAnalysis(): Promise<StyleAnalysis> {
  const { id } = (await one<{ id: number }>("INSERT INTO style_analyses (business_id, status) VALUES ($1, 'queued') RETURNING id", [currentBusinessId()]))!;
  await enqueueJob('style.analyze', { analysisId: id });
  pokePoller();
  return (await getStyleAnalysis(id))!;
}

export async function emitStyleProgress(id: number) {
  bus.emitEvent({ type: 'style.progress', analysis: await getStyleAnalysis(id) });
}

// Push the learned voice onto an agent. For the default agent (or when no agent
// is specified) it writes the business-level settings — the same keys the
// dashboard edits and that employee.ts folds into the default agent's cached
// prompt — so single-agent businesses are unchanged. For a custom agent it
// writes that agent's own voice/tone/instructions columns.
export async function applyStyleProfile(id: number, agentId?: number): Promise<StyleAnalysis | undefined> {
  const a = await getStyleAnalysis(id);
  if (!a || a.status !== 'done' || !a.profile) return undefined;
  const target = agentId ? await getAgent(agentId) : await getDefaultAgent();
  if (target && !target.is_default) {
    await applyVoiceToAgent(target.id, a.profile, a.suggested_tone, a.suggested_instructions);
  } else {
    if (a.suggested_tone) await setSetting('ai_tone', a.suggested_tone);
    if (a.suggested_instructions) await setSetting('ai_instructions', a.suggested_instructions);
    await setSetting('communication_profile', a.profile);
  }
  await none('UPDATE style_analyses SET applied_at = (extract(epoch from now())::bigint) WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  return getStyleAnalysis(id);
}
