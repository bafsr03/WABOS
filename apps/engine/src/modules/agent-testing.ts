import { one, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { bus } from '../events.js';
import { getConversation, getOrCreateConversation, insertMessage } from './store.js';
import { getAgent, setConversationAgent } from './agents.js';
import { runAiEmployee, type ReplyDeliverer } from '../ai/employee.js';

// Agent testing. A business can exercise an agent from the Inbox against a
// flagged, non-deliverable "test contact" that never touches real WhatsApp,
// isn't billed, and stays out of the CRM/broadcasts. The reply is delivered
// socket-free by writing the outbound message straight to the store (which also
// streams it to the dashboard over the websocket).

// Deliver an AI reply without a WhatsApp socket: persist it as an outbound
// message. insertMessage emits message.new + conversation.updated to the UI.
const testDeliver: ReplyDeliverer = async (conversationId, text) => {
  await insertMessage({ conversationId, direction: 'out', text, fromAi: true });
};

// Synthetic jid so a test contact can never collide with a real WhatsApp jid and
// is obviously non-deliverable. One per agent, per business.
function testJid(agentId: number): string {
  return `test-${agentId}@wabos.test`;
}

// Create (or reset) the test conversation for an agent and return its id. Each
// start clears prior messages so a fresh test begins from an empty thread.
export async function startAgentTest(agentId: number): Promise<{ conversationId: number }> {
  const businessId = currentBusinessId();
  const agent = await getAgent(agentId);
  const jid = testJid(agentId);
  const name = `Prueba · ${agent?.name ?? 'Agente'}`;

  const existing = await one<{ id: number }>('SELECT id FROM contacts WHERE business_id = $1 AND jid = $2', [businessId, jid]);
  const contactId = existing
    ? existing.id
    : (await one<{ id: number }>(
        'INSERT INTO contacts (business_id, jid, phone, name, is_test) VALUES ($1, $2, $3, $4, 1) RETURNING id',
        [businessId, jid, jid, name],
      ))!.id;
  // Keep the label current if the agent was renamed.
  await none('UPDATE contacts SET name = $1 WHERE id = $2', [name, contactId]);

  const conversation = await getOrCreateConversation(contactId);
  // Fresh thread + AI mode, pinned to the agent under test.
  await none("UPDATE conversations SET mode = 'ai', unread_count = 0 WHERE id = $1", [conversation.id]);
  await none('DELETE FROM messages WHERE conversation_id = $1', [conversation.id]);
  await setConversationAgent(conversation.id, agentId);

  return { conversationId: conversation.id };
}

// Send a message AS the customer into a test conversation and run the agent.
// Guards that the target really is a test conversation so this path can never
// insert into or reply on a real customer thread.
export async function sendTestMessage(conversationId: number, text: string): Promise<{ ok: boolean; error?: string }> {
  const convo = await getConversation(conversationId);
  if (!convo) return { ok: false, error: 'Conversation not found' };
  if ((convo as any).is_test !== 1) return { ok: false, error: 'Not a test conversation' };

  await insertMessage({ conversationId, direction: 'in', text });
  await runAiEmployee(conversationId, 0, testDeliver);
  return { ok: true };
}

// Delete a test conversation by removing its contact (cascades conversation +
// messages). Guarded to test conversations only.
export async function deleteTestConversation(conversationId: number): Promise<{ ok: boolean; error?: string }> {
  const convo = await getConversation(conversationId);
  if (!convo) return { ok: false, error: 'Conversation not found' };
  if ((convo as any).is_test !== 1) return { ok: false, error: 'Not a test conversation' };

  await none('DELETE FROM contacts WHERE id = $1 AND business_id = $2', [(convo as any).contact_id, currentBusinessId()]);
  return { ok: true };
}
