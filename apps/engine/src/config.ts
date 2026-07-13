import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dashboardToken: process.env.DASHBOARD_TOKEN ?? 'wabos-dev-token',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiModel: process.env.AI_MODEL ?? 'claude-sonnet-5',
  aiVisionModel: process.env.AI_VISION_MODEL ?? 'claude-haiku-4-5',
  rootDir,
  dataDir: path.join(rootDir, 'data'),
  mediaDir: path.join(rootDir, 'data', 'media'),
  authDir: path.join(rootDir, 'auth'),
};
