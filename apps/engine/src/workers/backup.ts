import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { one, many, none } from '../db/index.js';

// Operator-level automated backups. Writes a gzipped JSON snapshot of every data
// table (all tenants) to config.backupDir, then records the file's real byte size
// and per-table row counts in the `backups` table with a verified/failed status.
// Because those numbers come from what was actually written, a run can never
// report success on an empty file — the fix for "backups that were empty folders".

const DAY_MS = 24 * 60 * 60_000;

// Every table except migration bookkeeping and the backup ledger itself.
async function dataTables(): Promise<string[]> {
  const rows = await many<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       AND table_name NOT IN ('schema_migrations', 'backups')
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

export interface BackupResult { ok: boolean; path?: string; sizeBytes?: number; totalRows?: number; error?: string }

export async function runBackup(): Promise<BackupResult> {
  const dir = config.backupDir;
  if (!dir) return { ok: false, error: 'BACKUP_DIR not set' };
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `wabos-backup-${stamp}.json.gz`);

  try {
    const tables = await dataTables();
    const snapshot: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};
    let totalRows = 0;
    for (const t of tables) {
      const rows = await many(`SELECT * FROM "${t}"`);
      snapshot[t] = rows;
      rowCounts[t] = rows.length;
      totalRows += rows.length;
    }
    const payload = JSON.stringify({ createdAt: Date.now(), tables: rowCounts, data: snapshot });
    fs.writeFileSync(file, zlib.gzipSync(payload));
    const sizeBytes = fs.statSync(file).size;

    // Verification: the file must be non-empty and contain at least the seed rows.
    if (sizeBytes <= 0 || totalRows <= 0) {
      throw new Error(`verification failed: ${sizeBytes} bytes, ${totalRows} rows`);
    }
    await none(
      `INSERT INTO backups (path, size_bytes, row_counts, total_rows, status) VALUES ($1,$2,$3,$4,'verified')`,
      [file, sizeBytes, JSON.stringify(rowCounts), totalRows],
    );
    logger.info({ file, sizeBytes, totalRows }, 'backup verified');
    await pruneOldBackups();
    return { ok: true, path: file, sizeBytes, totalRows };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    try { fs.rmSync(file, { force: true }); } catch { /* nothing written */ }
    await none(`INSERT INTO backups (path, size_bytes, status, error) VALUES ($1,0,'failed',$2)`, [file, msg]).catch(() => {});
    logger.error({ err, file }, 'backup failed');
    return { ok: false, error: msg };
  }
}

// Keep only the most recent config.backupRetention verified files; delete older
// files from disk and their ledger rows.
async function pruneOldBackups(): Promise<void> {
  const keep = Math.max(1, config.backupRetention);
  const old = await many<{ id: number; path: string }>(
    `SELECT id, path FROM backups WHERE status = 'verified' ORDER BY created_at DESC OFFSET $1`,
    [keep],
  );
  for (const b of old) {
    try { fs.rmSync(b.path, { force: true }); } catch { /* already gone */ }
    await none('DELETE FROM backups WHERE id = $1', [b.id]);
  }
}

export async function listBackups(limit = 20): Promise<any[]> {
  return many('SELECT id, path, size_bytes, row_counts, total_rows, status, error, created_at FROM backups ORDER BY created_at DESC LIMIT $1', [limit]);
}

export async function latestBackup(): Promise<any | undefined> {
  return one('SELECT id, path, size_bytes, total_rows, status, error, created_at FROM backups ORDER BY created_at DESC LIMIT 1');
}

export function startBackupScheduler(): void {
  if (!config.backupDir) return; // disabled until BACKUP_DIR is configured
  // First run shortly after boot, then daily.
  setTimeout(() => void runBackup().catch((err) => logger.warn({ err }, 'initial backup failed')), 30_000).unref();
  setInterval(() => void runBackup().catch((err) => logger.warn({ err }, 'scheduled backup failed')), DAY_MS).unref();
}
