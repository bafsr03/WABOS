import type Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { setConversationMode, type Conversation, type Contact } from '../modules/store.js';

export const toolDefinitions: Anthropic.Tool[] = [
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

export interface ToolContext {
  conversation: Conversation & Contact;
  handedOff: boolean;
}

export function executeTool(name: string, input: any, ctx: ToolContext): string {
  switch (name) {
    case 'search_catalog': {
      const q = `%${String(input.query ?? '').trim()}%`;
      const rows = db.prepare(
        'SELECT name, description, price, currency FROM products WHERE active = 1 AND (name LIKE ? OR description LIKE ?) LIMIT 8'
      ).all(q, q) as { name: string; description: string; price: number; currency: string }[];
      if (rows.length === 0) return 'No products matched that search.';
      return rows.map((p) => `- ${p.name}: ${p.currency} ${p.price.toFixed(2)}${p.description ? ` — ${p.description}` : ''}`).join('\n');
    }
    case 'handoff_to_human': {
      ctx.handedOff = true;
      setConversationMode(ctx.conversation.id, 'human');
      return 'Conversation transferred to a human agent. Say goodbye politely and let the customer know a person will reply soon.';
    }
    case 'tag_customer': {
      const tag = String(input.tag ?? '').trim().toLowerCase();
      if (!tag) return 'Invalid tag.';
      db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tag);
      const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as { id: number };
      db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)')
        .run(ctx.conversation.contact_id, tagRow.id);
      return `Tag "${tag}" added to the customer.`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
