import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'wabos.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jid        TEXT NOT NULL UNIQUE,
  phone      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','human')),
  unread_count    INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_message_id   TEXT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  type            TEXT NOT NULL DEFAULT 'text',
  text            TEXT NOT NULL DEFAULT '',
  from_ai         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'sent',
  timestamp       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id
  ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, timestamp);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'PEN',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS faqs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  tag_id     INTEGER REFERENCES tags(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','done','failed')),
  total      INTEGER NOT NULL DEFAULT 0,
  sent       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error        TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  path       TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS charges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'PEN',
  concept    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','review','rejected','expired','cancelled')),
  created_by TEXT NOT NULL DEFAULT 'dashboard',
  due_at     INTEGER,
  paid_at    INTEGER,
  receipt_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_charges_contact ON charges(contact_id, status);

CREATE TABLE IF NOT EXISTS receipts (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id               INTEGER NOT NULL REFERENCES media(id),
  message_id             INTEGER NOT NULL,
  contact_id             INTEGER NOT NULL,
  conversation_id        INTEGER NOT NULL,
  charge_id              INTEGER REFERENCES charges(id),
  is_receipt             INTEGER,
  provider               TEXT,
  amount                 REAL,
  currency               TEXT,
  date                   TEXT,
  operation_number       TEXT,
  sender_name            TEXT,
  recipient_name         TEXT,
  recipient_phone_suffix TEXT,
  confidence             REAL,
  outcome                TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','auto_verified','review','rejected','not_receipt','manual_verified','manual_rejected')),
  reasons                TEXT NOT NULL DEFAULT '[]',
  raw_extraction         TEXT,
  created_at             INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Fraud gate: a verified operation number can only be consumed once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_opnum
  ON receipts(provider, operation_number)
  WHERE operation_number IS NOT NULL AND outcome IN ('auto_verified','manual_verified');
CREATE INDEX IF NOT EXISTS idx_receipts_outcome ON receipts(outcome);

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','dead')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  last_error   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs(status, run_at);

-- Ground-truth ledger: the merchant's real incoming Yape/Plin/bank alerts,
-- fed by any source (email poller, webhook, manual). The verifier matches a
-- screenshot against an unconsumed row here before auto-confirming a payment.
CREATE TABLE IF NOT EXISTS payment_notifications (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source               TEXT NOT NULL DEFAULT 'webhook'
    CHECK (source IN ('email','webhook','manual')),
  provider             TEXT,
  amount               REAL,
  currency             TEXT NOT NULL DEFAULT 'PEN',
  operation_number     TEXT,
  sender_name          TEXT,
  raw_text             TEXT,
  received_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  ingested_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  consumed_by_receipt_id INTEGER,
  external_id          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paynotif_external ON payment_notifications(source, external_id);
CREATE INDEX IF NOT EXISTS idx_paynotif_opnum ON payment_notifications(provider, operation_number);
CREATE INDEX IF NOT EXISTS idx_paynotif_amount ON payment_notifications(amount, received_at);
`);

// Idempotent column additions for DBs created before a column existed. SQLite
// can't ALTER a CHECK constraint, so new receipt *columns* go here while new
// enum values are avoided (re-checking receipts stay in outcome='pending').
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrate() {
  addColumnIfMissing('receipts', 'notification_id', 'INTEGER');
  addColumnIfMissing('receipts', 'verification_method', 'TEXT');
}

migrate();

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
