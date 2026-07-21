import type Anthropic from '@anthropic-ai/sdk';
import { one, many, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { setConversationMode, type Conversation, type Contact } from '../modules/store.js';
import { setConversationAgent, type RoutableAgent } from '../modules/agents.js';
import { searchKnowledge } from '../modules/knowledge.js';
import { createCharge, getPaymentSettings } from '../modules/charges.js';
import { recordEvent } from '../modules/analytics.js';

const CREATE_CHARGE_TOOL: Anthropic.Tool = {
  name: 'create_charge',
  description:
    'Register a payment the customer owes and get the business payment details (Yape/Plin) to share with them. ' +
    'Use it when a purchase is agreed and it is time to collect. After calling it, tell the customer the amount and ' +
    'the Yape/Plin name and number returned, and ask them to send the payment screenshot here so it can be verified.',
  input_schema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to charge, e.g. 50 for S/ 50.00' },
      concept: { type: 'string', description: 'Short description of what is being charged, e.g. "2 polos azules"' },
      due_in_hours: { type: 'number', description: 'Optional: hours from now until the payment is due (used for reminders).' },
    },
    required: ['amount'],
  },
};

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
export function buildToolDefinitions(routable: RoutableAgent[], opts: { canCharge?: boolean } = {}): Anthropic.Tool[] {
  const base = opts.canCharge ? [...BASE_TOOLS, CREATE_CHARGE_TOOL] : BASE_TOOLS;
  if (routable.length === 0) return base;
  const roster = routable.map((a) => `- ${a.slug}: ${a.description || a.name}`).join('\n');
  return [
    ...base,
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
      // Hide out-of-stock items when the product tracks stock, so the AI never
      // offers something the business can't sell. Untracked items (stock NULL or
      // track_stock=0) are always available.
      const rows = await many<{ name: string; description: string; price: number; currency: string }>(
        `SELECT name, description, price, currency FROM products
         WHERE business_id = $1 AND active = 1 AND (name ILIKE $2 OR description ILIKE $2)
           AND NOT (track_stock = 1 AND COALESCE(stock, 0) <= 0)
         LIMIT 8`,
        [currentBusinessId(), q],
      );
      recordEvent('catalog.search', { contactId: ctx.conversation.contact_id, meta: { query: String(input.query ?? '').slice(0, 80), hits: rows.length } });
      if (rows.length === 0) return 'No products matched that search (or matching products are out of stock).';
      return rows.map((p) => `- ${p.name}: ${p.currency} ${p.price.toFixed(2)}${p.description ? ` — ${p.description}` : ''}`).join('\n');
    }
    case 'search_knowledge': {
      const rows = await searchKnowledge(String(input.query ?? ''));
      if (rows.length === 0) return 'No knowledge base articles matched that search.';
      return rows.map((d) => `# ${d.title}\n${d.content}`).join('\n\n---\n\n');
    }
    case 'handoff_to_human': {
      ctx.handedOff = true;
      recordEvent('handoff', { contactId: ctx.conversation.contact_id, meta: { reason: String(input.reason ?? '').slice(0, 120) } });
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
    case 'create_charge': {
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return 'Invalid amount. Ask the customer to confirm the price and try again.';
      const concept = String(input.concept ?? '').trim();
      const dueInHours = Number(input.due_in_hours);
      const dueAt = Number.isFinite(dueInHours) && dueInHours > 0
        ? Math.floor(Date.now() / 1000) + Math.round(dueInHours * 3600)
        : null;
      const charge = await createCharge({ contactId: ctx.conversation.contact_id, amount, concept, dueAt, createdBy: 'ai' });
      const s = await getPaymentSettings();
      const cur = charge.currency === 'PEN' ? 'S/' : charge.currency;
      const details: string[] = [];
      if (s.yapeName || s.yapePhone) details.push(`Yape: ${s.yapeName || ''}${s.yapePhone ? ` (${s.yapePhone})` : ''}`.trim());
      if (s.plinName || s.plinPhone) details.push(`Plin: ${s.plinName || ''}${s.plinPhone ? ` (${s.plinPhone})` : ''}`.trim());
      const pay = details.length ? details.join(' · ') : 'the business has not configured Yape/Plin yet — hand off to a human to arrange payment';
      return `Charge created for ${cur} ${amount.toFixed(2)}${concept ? ` (${concept})` : ''}. ` +
        `Share these payment details with the customer and ask for the payment screenshot: ${pay}.`;
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
