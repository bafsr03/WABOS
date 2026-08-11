import fs from 'node:fs';
import { getSetting, setSetting, tx } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { currentBusinessId } from '../context.js';

// WABOS separates two data layers:
//  - BRAND (durable, belongs to the business): catalog, FAQs, knowledge, CRM,
//    the ADN de voz analysis, and all settings/config.
//  - CONNECTION (belongs to one WhatsApp number): the actual chats and money records.
// Changing numbers resets only the connection layer; a full unlink wipes everything.
//
// Every delete is scoped to the current business and ordered child→parent so
// Postgres foreign keys are never violated. Child tables without a business_id
// (messages, media, broadcast_recipients, contact_tags) are cleared through their
// parent's business_id. Agents survive a wipe so the AI always has a default.

const CONNECTION_DELETES: string[] = [
  'DELETE FROM receipts WHERE business_id = $1',
  'DELETE FROM media WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.business_id = $1)',
  'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE business_id = $1)',
  'DELETE FROM broadcast_recipients WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE business_id = $1)',
  'DELETE FROM broadcasts WHERE business_id = $1',
  // The charge goes with the old number, but the sale it produced is revenue and
  // stays. Unlink first: sales.charge_id is a hard reference, so deleting charges
  // underneath a sale would fail outright.
  'UPDATE sales SET charge_id = NULL WHERE business_id = $1',
  'DELETE FROM charges WHERE business_id = $1',
  'DELETE FROM payment_notifications WHERE business_id = $1',
  'DELETE FROM conversations WHERE business_id = $1',
  'DELETE FROM history_imports WHERE business_id = $1',
  'DELETE FROM jobs WHERE business_id = $1',
];

// The register: sales, the cash ledger, inventory history and the event log.
// These are NOT part of the connection layer — changing your WhatsApp number
// must not erase your revenue or your stock history. They only go on a full wipe
// or an account deletion, and they run FIRST because sales reference charges and
// events reference contacts, both of which are deleted further down.
const REGISTER_DELETES: string[] = [
  'DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE business_id = $1)',
  'DELETE FROM sales WHERE business_id = $1',
  'DELETE FROM stock_movements WHERE business_id = $1',
  'DELETE FROM stock_entry_items WHERE entry_id IN (SELECT id FROM stock_entries WHERE business_id = $1)',
  'DELETE FROM stock_entries WHERE business_id = $1',
  'DELETE FROM cash_sessions WHERE business_id = $1',
  'DELETE FROM cash_movements WHERE business_id = $1',
  'DELETE FROM events WHERE business_id = $1',
];

const BRAND_DELETES: string[] = [
  'DELETE FROM knowledge_documents WHERE business_id = $1',
  'DELETE FROM knowledge_collections WHERE business_id = $1',
  'DELETE FROM contact_tags WHERE contact_id IN (SELECT id FROM contacts WHERE business_id = $1)',
  'DELETE FROM contacts WHERE business_id = $1',
  'DELETE FROM tags WHERE business_id = $1',
  'DELETE FROM style_analyses WHERE business_id = $1',
  'DELETE FROM faqs WHERE business_id = $1',
  'DELETE FROM products WHERE business_id = $1',
  'DELETE FROM settings WHERE business_id = $1',
];

async function runDeletes(statements: string[]): Promise<void> {
  const businessId = currentBusinessId();
  await tx(async (client) => {
    for (const text of statements) await client.query(text, [businessId]);
  });
}

function clearMediaFiles(): void {
  try {
    fs.rmSync(config.mediaDir, { recursive: true, force: true });
    fs.mkdirSync(config.mediaDir, { recursive: true });
  } catch (err) {
    logger.warn({ err }, 'reset: could not clear media directory');
  }
}

// Used when unlinking the number entirely ("Borrar todo y empezar de cero").
export async function wipeAllData(): Promise<void> {
  await runDeletes([...REGISTER_DELETES, ...CONNECTION_DELETES, ...BRAND_DELETES]);
  clearMediaFiles();
  logger.info('all local data wiped');
}

// Account deletion: remove EVERYTHING for the current business — all data, its
// agents, its memberships, and the business row itself. Ordered child→parent so
// the FKs to businesses(id) are satisfied.
export async function purgeBusiness(): Promise<void> {
  await runDeletes([
    ...REGISTER_DELETES,
    ...CONNECTION_DELETES,
    ...BRAND_DELETES,
    'DELETE FROM agents WHERE business_id = $1',
    'DELETE FROM memberships WHERE business_id = $1',
    'DELETE FROM businesses WHERE id = $1',
  ]);
  clearMediaFiles();
  logger.info({ businessId: currentBusinessId() }, 'business purged');
}

// Used when changing numbers: keep brand assets + CRM, drop everything tied to the
// old number's chats. Brand settings persist; only the transient full-sync flag resets.
export async function clearConnectionData(): Promise<void> {
  await runDeletes(CONNECTION_DELETES);
  clearMediaFiles();
  await setSetting('history_full_sync', '0');
  logger.info('connection data cleared (brand + CRM kept)');
}

// Identity anchor: the WhatsApp number this instance owns. On every connect we
// compare it to the number that actually linked. A mismatch means the owner
// swapped numbers, so we reset the connection layer (keeping the brand).
export async function reconcileLinkedNumber(phone: string): Promise<void> {
  if (!phone) return;
  const known = await getSetting('account_phone', '');
  if (known === phone) return; // same number — session resume / same-number re-scan

  if (known && known !== phone) {
    logger.info({ from: known, to: phone }, 'linked number changed — clearing connection data');
    await clearConnectionData();
    bus.emitEvent({ type: 'account.number_changed' });
  }
  await setSetting('account_phone', phone);
}
