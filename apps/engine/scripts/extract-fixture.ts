// Run the receipt extractor against a local screenshot to tune the prompt:
//   npx tsx scripts/extract-fixture.ts path/to/receipt.jpg
import fs from 'node:fs';
import path from 'node:path';
import { extractReceipt, isExtractorAvailable } from '../src/ai/receipt-extractor.js';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npx tsx scripts/extract-fixture.ts <image>');
    process.exit(1);
  }
  if (!isExtractorAvailable()) {
    console.error('ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }
  const mime = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'image/jpeg';
  const base64 = fs.readFileSync(file).toString('base64');
  const started = Date.now();
  const extraction = await extractReceipt(base64, mime);
  console.log(JSON.stringify(extraction, null, 2));
  console.log(`\n(${Date.now() - started}ms)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
