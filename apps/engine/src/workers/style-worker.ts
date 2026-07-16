import { one, many, none } from '../db/index.js';
import { logger } from '../logger.js';
import { currentBusinessId } from '../context.js';
import { listMessages, type Message } from '../modules/store.js';
import { emitStyleProgress, getStyleAnalysis } from '../modules/style.js';
import { analyzeConversation, synthesizeProfile } from '../ai/style-analyzer.js';

// Voice DNA orchestration. Maps over recent conversations to (a) collect style
// observations and (b) tag contacts, then reduces the observations into one
// profile. Guardrails keep it bounded whether the store has 50 messages or 50k.
const MAX_CONVERSATIONS = 300;   // newest conversations with any business reply
const TRANSCRIPT_CHAR_CAP = 6000; // per conversation, to keep map calls cheap
const HUMAN_THRESHOLD = 40;      // below this, learn from AI replies too (fallback)
const MAX_OBSERVATIONS = 400;    // sampled before the reduce pass

function label(m: Message): string {
  if (m.direction === 'in') return 'CUSTOMER';
  return m.from_ai ? 'BUSINESS-AI' : 'BUSINESS';
}

function buildTranscript(messages: Message[]): { text: string; businessLines: number } {
  let businessLines = 0;
  const lines: string[] = [];
  for (const m of messages) {
    const body = (m.text ?? '').trim() || (m.type !== 'text' ? `[${m.type}]` : '');
    if (!body) continue;
    if (m.direction === 'out' && !m.from_ai) businessLines++;
    lines.push(`[${label(m)}] ${body}`);
  }
  let text = lines.join('\n');
  if (text.length > TRANSCRIPT_CHAR_CAP) text = text.slice(-TRANSCRIPT_CHAR_CAP); // keep the most recent
  return { text, businessLines };
}

async function applyTags(contactId: number, tags: string[]): Promise<number> {
  let added = 0;
  const businessId = currentBusinessId();
  for (const tag of tags) {
    await none('INSERT INTO tags (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, lower(name)) DO NOTHING', [businessId, tag]);
    const row = await one<{ id: number }>('SELECT id FROM tags WHERE business_id = $1 AND lower(name) = lower($2)', [businessId, tag]);
    if (!row) continue;
    const res = await one('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING contact_id', [contactId, row.id]);
    if (res) added++;
  }
  return added;
}

// Evenly sample down to a cap so the reduce prompt stays within context.
function sample<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const step = items.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

export async function runStyleAnalysis(payload: { analysisId: number }): Promise<void> {
  const id = payload.analysisId;
  const businessId = currentBusinessId();
  const analysis = await getStyleAnalysis(id);
  if (!analysis || analysis.status === 'done' || analysis.status === 'failed') return;

  const fail = async (message: string) => {
    await none("UPDATE style_analyses SET status = 'failed', error = $1, completed_at = (extract(epoch from now())::bigint) WHERE id = $2",
      [message.slice(0, 500), id]);
    await emitStyleProgress(id);
  };

  try {
    const humanOut = (await one<{ n: number }>(`
      SELECT COUNT(*)::int AS n FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.business_id = $1 AND m.direction = 'out' AND m.from_ai = 0
    `, [businessId]))!.n;
    const source: 'human' | 'all' = humanOut < HUMAN_THRESHOLD ? 'all' : 'human';

    // Conversations that actually have an outbound message, newest first.
    const conversations = await many<{ id: number; contact_id: number }>(`
      SELECT c.id, c.contact_id FROM conversations c
      WHERE c.business_id = $1 AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'out')
      ORDER BY c.last_message_at DESC
      LIMIT $2
    `, [businessId, MAX_CONVERSATIONS]);

    if (conversations.length === 0) return fail('No hay conversaciones con respuestas del negocio para analizar.');

    await none("UPDATE style_analyses SET status = 'running', source = $1, conversations_total = $2 WHERE id = $3",
      [source, conversations.length, id]);
    await emitStyleProgress(id);

    const observations: string[] = [];
    let messagesAnalyzed = 0;
    let contactsTagged = 0;

    for (const conv of conversations) {
      const messages = await listMessages(conv.id, 200);
      const { text, businessLines } = buildTranscript(messages);
      if (text) {
        try {
          const result = await analyzeConversation(text);
          observations.push(...result.style_observations);
          messagesAnalyzed += businessLines;
          if (result.contact_tags.length && (await applyTags(conv.contact_id, result.contact_tags)) > 0) contactsTagged++;
        } catch (err) {
          logger.warn({ err, conversationId: conv.id }, 'style: conversation analysis failed, skipping');
        }
      }
      await none('UPDATE style_analyses SET conversations_done = conversations_done + 1, messages_analyzed = $1, contacts_tagged = $2 WHERE id = $3',
        [messagesAnalyzed, contactsTagged, id]);
      await emitStyleProgress(id);
    }

    if (observations.length === 0) return fail('No se encontraron suficientes mensajes del negocio para construir un perfil.');

    const { profile, model } = await synthesizeProfile(
      sample(observations, MAX_OBSERVATIONS),
      { conversations: conversations.length, businessMessages: messagesAnalyzed },
    );

    await none(`
      UPDATE style_analyses
      SET status = 'done', profile = $1, suggested_tone = $2, suggested_instructions = $3, model = $4,
          error = NULL, completed_at = (extract(epoch from now())::bigint)
      WHERE id = $5
    `, [JSON.stringify(profile), profile.suggested_tone, profile.suggested_instructions, model, id]);
    await emitStyleProgress(id);
    logger.info({ analysisId: id, conversations: conversations.length, observations: observations.length, contactsTagged }, 'style analysis done');
  } catch (err: any) {
    // Expensive AI run — don't auto-retry the whole thing; surface it and let
    // the owner re-trigger. Any tags already applied stay.
    logger.error({ err, analysisId: id }, 'style analysis failed');
    await fail(String(err?.message ?? err));
  }
}
