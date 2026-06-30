import { describe, it, expect } from 'vitest';
import { messagesToLines } from '@/sidepanel/utils/displayLines';
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

describe('messagesToLines reasoning reconstruction (B-thinking)', () => {
  it('emits a thinking line before each round, surviving a reload', () => {
    const lines = messagesToLines([
      msg({ role: 'user', content: 'go' }),
      // round 1: reasoning + a tool call
      msg({
        role: 'assistant',
        content: '',
        reasoning: 'first thought',
        toolCalls: [{ id: 't1', name: 'open_tab', arguments: {} }],
      }),
      msg({ role: 'tool', toolResult: { toolCallId: 't1', content: 'ok' } }),
      // round 2: reasoning + final reply
      msg({ role: 'assistant', content: 'all done', reasoning: 'second thought' }),
    ]);

    const roles = lines.map((l) => l.role);
    // user, thinking(round1), tool(round1), thinking(round2), assistant
    expect(roles).toEqual(['user', 'thinking', 'tool', 'thinking', 'assistant']);
    const thinking = lines.filter((l) => l.role === 'thinking').map((l) => l.content);
    expect(thinking).toEqual(['first thought', 'second thought']);
  });

  it('omits the thinking line when a turn has no reasoning', () => {
    const lines = messagesToLines([
      msg({ role: 'user', content: 'hi' }),
      msg({ role: 'assistant', content: 'hello' }),
    ]);
    expect(lines.some((l) => l.role === 'thinking')).toBe(false);
  });
});
