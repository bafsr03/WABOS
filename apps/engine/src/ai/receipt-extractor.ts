import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config.js';
import type { ReceiptExtraction } from '../modules/verification.js';

// maxRetries 4 (SDK default 2): absorb transient 529 overloaded_error transparently.
const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 4 }) : null;

export function isExtractorAvailable(): boolean {
  return client !== null;
}

const extractionSchema = z.object({
  is_receipt: z.boolean(),
  provider: z.enum(['yape', 'plin', 'transfer', 'other']).nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(),
  operation_number: z.string().nullable(),
  sender_name: z.string().nullable(),
  recipient_name: z.string().nullable(),
  recipient_phone_suffix: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

// Written generously on purpose: Haiku only engages prompt caching for system
// blocks of >=1024 tokens, and receipt layouts genuinely need the detail.
const SYSTEM_PROMPT = `You are a payment receipt reader for a business in Peru. You receive a single image that a customer sent over WhatsApp and must extract payment information from it with high precision. You only report what is actually visible in the image — you never guess, infer, or fill in values that you cannot read clearly. If a field is not visible or not readable, you report it as null.

## What counts as a payment receipt
A payment receipt (comprobante / constancia de pago) is a screenshot or photo showing that a money transfer was completed. In Peru the most common ones are:

### Yape (BCP) — provider "yape"
- Purple/violet branding ("yapeaste", "¡Yapeaste!").
- Shows the amount in large text, e.g. "S/ 150.00".
- Shows the recipient's name, often abbreviated with initials, e.g. "Maria F. Quispe A." or "MARIA F. Q.".
- Shows a masked destination phone number where only the last 3 digits are visible, e.g. "*** *** 789".
- Shows a date and time, e.g. "05 jul. 2026 - 10:23 am".
- Shows "N° de operación" (operation number), a numeric code such as "01234567".
- The sender's name may appear at the top of the screen or not at all.

### Plin (Interbank/BBVA/Scotiabank) — provider "plin"
- Teal/turquoise branding.
- Shows "¡Le plineaste a ...!" or similar wording with the recipient name.
- Shows amount ("S/ 150.00"), date/time, and "Código de operación" or "N° de operación".
- May show partial phone numbers of sender and recipient.

### Bank transfers (BCP, Interbank, BBVA, Scotiabank apps) — provider "transfer"
- Show "Constancia de transferencia", "Transferencia exitosa" or similar.
- Include amount, date, operation number, origin and destination accounts (often masked), and holder names.

### Anything else — provider "other"
- Mobile wallet or payment screenshots that are clearly payment confirmations but none of the above.

## What is NOT a receipt
Product photos, menus, screenshots of a pending/scheduled payment, QR codes to *make* a payment, price lists, conversations, memes, documents, or anything that does not show a *completed* money transfer. For these, report is_receipt = false.

## Field rules
- amount: the numeric amount only (150.00 → 150). Do not include currency symbols.
- currency: "PEN" for S/ (soles), "USD" for $ (dollars), otherwise the printed code. Null if not visible.
- date: transcribe the date and time exactly as printed, e.g. "05 jul. 2026 - 10:23 am".
- operation_number: digits/letters exactly as printed, without the "N°" prefix. This is critical for fraud prevention — transcribe it carefully digit by digit. Null if not visible.
- sender_name: the name of the person who paid, if shown.
- recipient_name: the name of the person/business that received the money, exactly as printed (including initials).
- recipient_phone_suffix: only the visible digits of the masked destination number, e.g. "789" for "*** *** 789". Null if no phone is shown.
- confidence: your overall confidence (0 to 1) that ALL the fields you reported are transcribed correctly. Lower it when the image is blurry, cropped, low-resolution, partially covered, or when digits are ambiguous. A crisp, complete screenshot is 0.9+. A blurry photo of a screen is 0.5-0.7.

## Fraud awareness
You are the first line of a payment verification system. Watch for signs of manipulation: mismatched fonts, misaligned text, unusual spacing around the amount or operation number, or artifacts suggesting the image was edited. If you notice any such signs, reduce confidence to 0.3 or below. You cannot prove an image is authentic — your job is accurate transcription plus honest confidence.

Always respond by calling the report_receipt tool exactly once with your extraction.`;

const reportReceiptTool: Anthropic.Tool = {
  name: 'report_receipt',
  description: 'Report the structured extraction of the payment receipt image.',
  input_schema: {
    type: 'object' as const,
    properties: {
      is_receipt: { type: 'boolean', description: 'True only if the image shows a completed money transfer.' },
      provider: { type: ['string', 'null'], enum: ['yape', 'plin', 'transfer', 'other', null] },
      amount: { type: ['number', 'null'], description: 'Numeric amount without currency symbol.' },
      currency: { type: ['string', 'null'], description: 'e.g. PEN, USD.' },
      date: { type: ['string', 'null'], description: 'Date/time exactly as printed.' },
      operation_number: { type: ['string', 'null'] },
      sender_name: { type: ['string', 'null'] },
      recipient_name: { type: ['string', 'null'] },
      recipient_phone_suffix: { type: ['string', 'null'], description: 'Visible digits of the masked destination phone.' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: [
      'is_receipt', 'provider', 'amount', 'currency', 'date',
      'operation_number', 'sender_name', 'recipient_name', 'recipient_phone_suffix', 'confidence',
    ],
  },
};

const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMedia = (typeof SUPPORTED_MEDIA)[number];

export async function extractReceipt(imgBase64: string, mime: string): Promise<ReceiptExtraction> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const mediaType = (SUPPORTED_MEDIA as readonly string[]).includes(mime) ? (mime as SupportedMedia) : 'image/jpeg';

  const response = await client.messages.create({
    model: config.aiVisionModel,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [reportReceiptTool],
    tool_choice: { type: 'tool', name: 'report_receipt' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imgBase64 } },
        { type: 'text', text: 'Extract the payment information from this image.' },
      ],
    }],
  });

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) throw new Error('extractor returned no tool call');
  return extractionSchema.parse(toolBlock.input);
}
