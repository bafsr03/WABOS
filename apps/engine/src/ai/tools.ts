import type Anthropic from '@anthropic-ai/sdk';
import { one, many, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { setConversationMode, type Conversation, type Contact } from '../modules/store.js';
import { setConversationAgent, type RoutableAgent } from '../modules/agents.js';
import { searchKnowledge } from '../modules/knowledge.js';

const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_catalog',
    description: 'Search the business product catalog by name or description. Use it whenever the customer asks about products, prices or availability.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, e.g. "polo azul" or "corte de cabello"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_knowledge',
    description: 'Search the business knowledge base (shipping and return policies, guides, procedures, brand info) by keywords. Use it when the customer asks about policies, delivery, returns, how something works, or other non-catalog details.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, e.g. "envío a provincia" or "política de devoluciones"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'handoff_to_human',
    description: 'Transfer this conversation to a human agent. Use it when the customer asks for a person, is upset, wants to negotiate, reports a serious problem, or you cannot help confidently.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason for the handoff' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'tag_customer',
    description: 'Add a CRM tag to this customer, e.g. "interesado", "cliente", "cotización". Use it to record buying intent or customer type.',
    input_schema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Tag name (short, lowercase)' },
      },
      required: ['tag'],
    },
  },
];

// Tools for one turn. When the business has other agents this chat can be routed
// to, append a self-describing route_to_agent tool whose schema enumerates those
// agents (slug + what each handles) so the model routes in-context — no separate
// classifier call. With no siblings, only the base tools are offered.
export function buildToolDefinitions(routable: RoutableAgent[]): Anthropic.Tool[] {
  if (routable.length === 0) return BASE_TOOLS;
  const roster = routable.map((a) => `- ${a.slug}: ${a.description || a.name}`).join('\n');
  return [
    ...BASE_TOOLS,
    {
      name: 'route_to_agent',
      description:
        'Hand this conversation to a better-suited teammate agent when the customer needs something outside your role. ' +
        `Available agents:\n${roster}`,
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: routable.map((a) => a.slug), description: 'Slug of the agent to route to' },
          reason: { type: 'string', description: 'Short reason for the routing' },
        },
        required: ['agent'],
      },
    },
  ];
}

export interface ToolContext {
  conversation: Conversation & Contact;
  handedOff: boolean;
  routable: RoutableAgent[];
  routedToAgentId: number | null;
}

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<string> {
  switch (name) {
    case 'search_catalog': {
      const q = `%${String(input.query ?? '').trim()}%`;
      const rows = await many<{ name: string; description: string; price: number; currency: string }>(
        'SELECT name, description, price, currency FROM products WHERE business_id = $1 AND active = 1 AND (name ILIKE $2 OR description ILIKE $2) LIMIT 8',
        [currentBusinessId(), q],
      );
      if (rows.length === 0) return 'No products matched that search.';
      return rows.map((p) => `- ${p.name}: ${p.currency} ${p.price.toFixed(2)}${p.description ? ` — ${p.description}` : ''}`).join('\n');
    }
    case 'search_knowledge': {
      const rows = await searchKnowledge(String(input.query ?? ''));
      if (rows.length === 0) return 'No knowledge base articles matched that search.';
      return rows.map((d) => `# ${d.title}\n${d.content}`).join('\n\n---\n\n');
    }
    case 'handoff_to_human': {
      ctx.handedOff = true;
      await setConversationMode(ctx.conversation.id, 'human');
      return 'Conversation transferred to a human agent. Say goodbye politely and let the customer know a person will reply soon.';
    }
    case 'route_to_agent': {
      const slug = String(input.agent ?? '').trim();
      const target = ctx.routable.find((a) => a.slug === slug);
      if (!target) {
        const options = ctx.routable.map((a) => a.slug).join(', ') || 'none';
        return `No agent with slug "${slug}". Available agents: ${options}.`;
      }
      await setConversationAgent(ctx.conversation.id, target.id);
      ctx.routedToAgentId = target.id;
      return `Conversation routed to "${target.name}". Do not reply further; they will take over.`;
    }
    case 'tag_customer': {
      const tag = String(input.tag ?? '').trim().toLowerCase();
      if (!tag) return 'Invalid tag.';
      const businessId = currentBusinessId();
      await none('INSERT INTO tags (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, lower(name)) DO NOTHING', [businessId, tag]);
      const tagRow = (await one<{ id: number }>('SELECT id FROM tags WHERE business_id = $1 AND lower(name) = lower($2)', [businessId, tag]))!;
      await none('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ctx.conversation.contact_id, tagRow.id]);
      return `Tag "${tag}" added to the customer.`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
