import { describe, it, expect } from 'vitest';
import { estimateTokens, shouldCompact } from '@/agent/compaction';
import type { ApiMessage } from '@/providers/chat-types';
import { DEFAULT_SETTINGS, type Model } from '@/types';

const model: Model = {
  id: 'm',
  providerId: 'p',
  enabled: true,
  contextWindow: 1000,
  capabilitySource: 'litellm',
};

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const msgs: ApiMessage[] = [{ role: 'user', content: 'a'.repeat(400) }];
    expect(estimateTokens(msgs)).toBe(100);
  });

  it('counts assistant tool-call arguments', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'x', arguments: 'a'.repeat(40) } },
        ],
      },
    ];
    expect(estimateTokens(msgs)).toBeGreaterThan(0);
  });

  it('counts multimodal text parts and charges a flat budget per image', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a'.repeat(400) }, // 100 tokens
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(200_000) } },
        ],
      },
    ];
    // 100 (text) + 1000 (image) — image cost must NOT scale with base64 length.
    expect(estimateTokens(msgs)).toBe(1100);
  });
});

describe('shouldCompact', () => {
  it('triggers past the threshold', () => {
    const msgs: ApiMessage[] = [{ role: 'user', content: 'a'.repeat(4000) }]; // ~1000 tokens
    expect(shouldCompact(msgs, { ...DEFAULT_SETTINGS, compactionThreshold: 0.7 }, model)).toBe(
      true,
    );
  });

  it('does not trigger when disabled', () => {
    const msgs: ApiMessage[] = [{ role: 'user', content: 'a'.repeat(4000) }];
    expect(shouldCompact(msgs, { ...DEFAULT_SETTINGS, compactionEnabled: false }, model)).toBe(
      false,
    );
  });

  it('does not trigger without a known context window', () => {
    const msgs: ApiMessage[] = [{ role: 'user', content: 'a'.repeat(4000) }];
    expect(shouldCompact(msgs, DEFAULT_SETTINGS, { ...model, contextWindow: undefined })).toBe(
      false,
    );
  });
});
