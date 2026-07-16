import { describe, it, expect, beforeAll } from 'vitest';

// Pure message-parsing helpers at the front of the inbound pipeline. No DB — the
// pg pool is created lazily on first query, and these functions never query.

let inbound: typeof import('./inbound.js');

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = '';
  inbound = await import('./inbound.js');
});

describe('extractText', () => {
  it('reads plain and extended text', () => {
    expect(inbound.extractText({ conversation: 'hola' })).toEqual({ text: 'hola', type: 'text' });
    expect(inbound.extractText({ extendedTextMessage: { text: 'mundo' } } as any)).toEqual({ text: 'mundo', type: 'text' });
  });

  it('uses the caption for images and a placeholder when absent', () => {
    expect(inbound.extractText({ imageMessage: { caption: 'mira' } } as any)).toEqual({ text: 'mira', type: 'image' });
    expect(inbound.extractText({ imageMessage: {} } as any)).toEqual({ text: '[imagen]', type: 'image' });
  });

  it('unwraps ephemeral/view-once envelopes', () => {
    expect(inbound.extractText({ ephemeralMessage: { message: { conversation: 'secreto' } } } as any))
      .toEqual({ text: 'secreto', type: 'text' });
  });

  it('returns null for empty or unrecognized messages', () => {
    expect(inbound.extractText(null)).toBeNull();
    expect(inbound.extractText({} as any)).toBeNull();
  });
});

describe('isIgnorableJid', () => {
  it('ignores groups, broadcasts and channels but keeps 1:1 chats', () => {
    expect(inbound.isIgnorableJid('123-456@g.us')).toBe(true);
    expect(inbound.isIgnorableJid('status@broadcast')).toBe(true);
    expect(inbound.isIgnorableJid('999@newsletter')).toBe(true);
    expect(inbound.isIgnorableJid('51999@s.whatsapp.net')).toBe(false);
  });
});
