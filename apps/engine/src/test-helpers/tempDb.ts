import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the engine at a throwaway data dir so the SQLite singleton + media dir
// are isolated per test file. MUST run before the engine's `db` module is first
// imported: call it in beforeAll and load engine modules with dynamic import()
// afterwards (static imports are hoisted and would init the DB against data/).
export function useTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabos-test-'));
  process.env.WABOS_DATA_DIR = dir;
  // Keep the Anthropic client null in tests (isAiAvailable() → false).
  process.env.ANTHROPIC_API_KEY = '';
  return dir;
}

export function cleanupTempDataDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
