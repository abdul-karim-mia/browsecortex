import { describe, it, expect } from 'vitest';
import { buildApiHistory, fromApiMessage, toApiMessage } from '@/conversations/mappers';
import type { Message } from '@/types';

function msg(partial: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    conversationId: 'c1',
    role: 'user',
    content: '',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('toApiMessage', () => {
  it('maps a user message', () => {
    expect(toApiMessage(msg({ role: 'user', content: 'hi' }))).toEqual({
      role: 'user',
      content: 'hi',
    });
  });

  it('maps an assistant message with tool calls, stringifying arguments', () => {
    const api = toApiMessage(
      msg({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'open_tab', arguments: { url: 'https://x.com' } }],
      }),
    );
    expect(api).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'open_tab', arguments: '{"url":"https://x.com"}' },
        },
      ],
    });
  });

  it('maps a tool result message', () => {
    const api = toApiMessage(
      msg({ role: 'tool', toolResult: { toolCallId: 'call_1', content: '{"id":7}' } }),
    );
    expect(api).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"id":7}' });
  });

  it('drops a tool message with no result', () => {
    expect(toApiMessage(msg({ role: 'tool' }))).toBeNull();
  });
});

describe('round-trip fidelity', () => {
  it('preserves an assistant tool-call turn through fromApiMessage → toApiMessage', () => {
    const original = msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'c', name: 'navigate_to', arguments: { url: 'https://a.b' } }],
    });
    const api = toApiMessage(original)!;
    const back = fromApiMessage(api, 'c1')!;
    expect(back.role).toBe('assistant');
    expect(back.toolCalls).toEqual(original.toolCalls);
  });
});

describe('reasoning persistence (B-thinking)', () => {
  it('persists assistant reasoning through fromApiMessage', () => {
    const stored = fromApiMessage(
      { role: 'assistant', content: 'done', reasoning: 'let me think' },
      'c1',
    )!;
    expect(stored.reasoning).toBe('let me think');
  });

  it('never sends reasoning back upstream (toApiMessage drops it)', () => {
    const api = toApiMessage(
      msg({ role: 'assistant', content: 'done', reasoning: 'private thoughts' }),
    )!;
    expect('reasoning' in api).toBe(false);
  });
});

describe('fromApiMessage multimodal flatten (PLAN §15)', () => {
  it('flattens image + text content parts to a text-only stored message', () => {
    const stored = fromApiMessage(
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
        ],
      },
      'c1',
    )!;
    expect(stored.role).toBe('user');
    expect(stored.content).toContain('look at this');
    expect(stored.content).toContain('[image attached]');
    expect(stored.content).not.toContain('base64');
  });
});

describe('buildApiHistory', () => {
  it('filters out null-mapping messages and preserves order', () => {
    const history = buildApiHistory([
      msg({ role: 'user', content: 'a' }),
      msg({ role: 'tool' }), // dropped (no result)
      msg({ role: 'assistant', content: 'b' }),
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
  });
});
