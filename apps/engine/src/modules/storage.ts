import { createHash, createHmac } from 'node:crypto';
import { config } from '../config.js';

// Product-image storage on Cloudflare R2 (S3-compatible). We sign a plain
// PutObject with AWS Signature V4 and PUT it over fetch — no AWS SDK dependency,
// so nothing new to install and the same code runs in dev and in the container.
// The stored image_path is a public URL built on R2_PUBLIC_BASE_URL, which the
// dashboard renders directly (no proxying through the engine).

export function isStorageConfigured(): boolean {
  return !!(config.r2AccountId && config.r2Bucket && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2PublicBaseUrl);
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
export function extForMime(mime: string): string | null {
  return MIME_EXT[mime.toLowerCase()] ?? null;
}

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
// RFC-3986 encoding for the canonical URI (S3 does NOT re-encode the path).
const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Upload the bytes and return the public URL to store in products.image_path.
export async function uploadProductImage(
  businessId: number, productId: number, body: Buffer, contentType: string,
): Promise<string> {
  const ext = extForMime(contentType);
  if (!ext) throw Object.assign(new Error('Formato de imagen no soportado'), { code: 'BAD_IMAGE' });

  const digest = sha256Hex(body).slice(0, 12);
  const key = `products/${businessId}/${productId}-${digest}.${ext}`;
  const host = `${config.r2AccountId}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + [config.r2Bucket, ...key.split('/')].map(enc).join('/');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const region = 'auto';
  const service = 's3';

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${config.r2SecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.r2AccessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization,
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 upload failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return `${config.r2PublicBaseUrl}/${key}`;
}
