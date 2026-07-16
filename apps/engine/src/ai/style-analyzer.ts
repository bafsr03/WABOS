import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getSetting } from '../db/index.js';

// Voice DNA analyzer. Two Claude passes over the store's own chat history:
//   map    — per conversation: pull short style observations + classify the
//            contact into CRM tags.
//   reduce — once: fold every observation into one structured voice profile
//            plus ready-to-apply tone/instructions for the AI Employee.
// Nothing here is business-specific: language and personality are derived from
// the store's actual messages, so the same code fits any WABOS tenant.

// maxRetries 4 (SDK default is 2): rides out transient 529 overloaded_error with
// exponential backoff + retry-after, so brief Anthropic saturation rarely reaches the UI.
const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 4 }) : null;

export function isAnalyzerAvailable(): boolean {
  return client !== null;
}

// ---- map: per-conversation observations + tagging --------------------------

const conversationSchema = z.object({
  style_observations: z.array(z.string()).default([]),
  contact_tags: z.array(z.string()).default([]),
});
export type ConversationAnalysis = z.infer<typeof conversationSchema>;

const MAP_SYSTEM = `You study how a business talks to its customers on WhatsApp, so its voice can later be reproduced. You are given one conversation transcript. Lines marked [BUSINESS] were written by the business (its owner or staff); lines marked [BUSINESS-AI] were written by an automated assistant; lines marked [CUSTOMER] are the customer.

Your job has two parts:

1. style_observations — 2 to 6 short, concrete notes about HOW THE BUSINESS writes, based ONLY on [BUSINESS] lines (ignore [BUSINESS-AI] unless there are no [BUSINESS] lines at all). Capture things a mimic would need: typical greeting, sign-off, message length, emoji use (which ones, how often), capitalisation/punctuation quirks, slang or signature phrases, the language/dialect they write in, how they quote prices, how they push toward a sale, how they handle objections or complaints. Be specific and quote tiny snippets when useful. If there are no business lines, return an empty array.

2. contact_tags — 1 to 3 short lowercase CRM tags classifying THIS customer from the whole thread (e.g. "cliente", "interesado", "cotizacion", "perdido", "mayorista", "postventa", "reclamo"). Use the language the business uses. Only tag what the conversation clearly supports; return an empty array if unclear.

Always respond by calling report_conversation exactly once. Do not invent details that are not in the transcript.`;

const reportConversationTool: Anthropic.Tool = {
  name: 'report_conversation',
  description: 'Report style observations about the business and CRM tags for this customer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      style_observations: {
        type: 'array', items: { type: 'string' },
        description: 'Short concrete notes on how the BUSINESS writes. Empty if no business lines.',
      },
      contact_tags: {
        type: 'array', items: { type: 'string' },
        description: '1-3 short lowercase CRM tags for this customer. Empty if unclear.',
      },
    },
    required: ['style_observations', 'contact_tags'],
  },
};

export async function analyzeConversation(transcript: string): Promise<ConversationAnalysis> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const model = await getSetting('ai_model', config.aiVisionModel); // cheaper model is fine for the map pass
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    system: [{ type: 'text', text: MAP_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [reportConversationTool],
    tool_choice: { type: 'tool', name: 'report_conversation' },
    messages: [{ role: 'user', content: transcript }],
  });
  logUsage('map', model, response.usage);
  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) throw new Error('analyzer returned no tool call');
  const parsed = conversationSchema.parse(toolBlock.input);
  return {
    style_observations: parsed.style_observations.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    contact_tags: parsed.contact_tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 3),
  };
}

// ---- reduce: synthesize the profile ----------------------------------------

const profileSchema = z.object({
  voice_summary: z.string().default(''),
  tone: z.array(z.string()).default([]),
  formality: z.string().default(''),
  avg_length: z.string().default(''),
  length_mix: z.object({
    short: z.number().default(0), medium: z.number().default(0), long: z.number().default(0),
  }).default({ short: 0, medium: 0, long: 0 }),
  emoji_usage: z.string().default(''),
  greetings: z.array(z.string()).default([]),
  signoffs: z.array(z.string()).default([]),
  signature_phrases: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  do: z.array(z.string()).default([]),
  dont: z.array(z.string()).default([]),
  suggested_tone: z.string().default(''),
  suggested_instructions: z.string().default(''),
});
export type VoiceProfile = z.infer<typeof profileSchema>;

const REDUCE_SYSTEM = `You are given many short observations about how one business writes to its customers on WhatsApp, gathered across many real conversations. Synthesize them into a single, faithful "voice profile" that another AI could use to reply exactly like this business.

Ground everything in the observations — do not invent a personality that is not supported. Detect the business's real language(s) and dialect and preserve them.

Return, via the report_profile tool:
- voice_summary: 2-4 sentences capturing the overall voice.
- tone: 3-6 adjectives.
- formality: one short phrase (e.g. "informal, tuteo").
- avg_length: a short human description of typical message length.
- length_mix: rough percentages (0-100, need not sum exactly) of short / medium / long messages.
- emoji_usage: how and which emojis are used.
- greetings, signoffs, signature_phrases: real examples the business uses (in their language).
- languages: the language(s)/dialect the business writes in.
- do / dont: concrete guidance for matching the voice.
- suggested_tone: ONE paragraph written as a direct instruction to the AI assistant describing how to sound, INCLUDING which language/dialect to reply in. This will be dropped straight into the assistant's system prompt.
- suggested_instructions: a few extra rules (bullet-like sentences) unique to this business's style — e.g. signature phrases to reuse, emoji habits, how to quote prices — that complement suggested_tone.

IMPORTANT — language: write ALL human-readable fields in SPANISH, because they are shown in a Spanish dashboard: voice_summary, tone, formality, avg_length, emoji_usage, languages, do, dont, suggested_tone and suggested_instructions. The only exception is the real example strings in greetings, signoffs and signature_phrases, which MUST stay verbatim in the business's own language/dialect. Always call report_profile exactly once.`;

const reportProfileTool: Anthropic.Tool = {
  name: 'report_profile',
  description: 'Report the synthesized voice profile of the business.',
  input_schema: {
    type: 'object' as const,
    properties: {
      voice_summary: { type: 'string' },
      tone: { type: 'array', items: { type: 'string' } },
      formality: { type: 'string' },
      avg_length: { type: 'string' },
      length_mix: {
        type: 'object',
        properties: { short: { type: 'number' }, medium: { type: 'number' }, long: { type: 'number' } },
        required: ['short', 'medium', 'long'],
      },
      emoji_usage: { type: 'string' },
      greetings: { type: 'array', items: { type: 'string' } },
      signoffs: { type: 'array', items: { type: 'string' } },
      signature_phrases: { type: 'array', items: { type: 'string' } },
      languages: { type: 'array', items: { type: 'string' } },
      do: { type: 'array', items: { type: 'string' } },
      dont: { type: 'array', items: { type: 'string' } },
      suggested_tone: { type: 'string' },
      suggested_instructions: { type: 'string' },
    },
    required: ['voice_summary', 'suggested_tone', 'suggested_instructions'],
  },
};

export async function synthesizeProfile(observations: string[], stats: { conversations: number; businessMessages: number }): Promise<{ profile: VoiceProfile; model: string }> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const model = await getSetting('ai_model', config.aiModel); // use the higher-quality model for synthesis
  const header = `These observations come from ${stats.conversations} conversations covering ${stats.businessMessages} business messages.\n\nObservations:\n`;
  const body = observations.map((o) => `- ${o}`).join('\n');
  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: [{ type: 'text', text: REDUCE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [reportProfileTool],
    tool_choice: { type: 'tool', name: 'report_profile' },
    messages: [{ role: 'user', content: header + body }],
  });
  logUsage('reduce', model, response.usage);
  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) throw new Error('analyzer returned no profile tool call');
  return { profile: profileSchema.parse(toolBlock.input), model };
}

function logUsage(phase: string, model: string, u: Anthropic.Usage) {
  logger.info({
    phase, model,
    input: u.input_tokens, output: u.output_tokens,
    cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
  }, 'style analyzer usage');
}
