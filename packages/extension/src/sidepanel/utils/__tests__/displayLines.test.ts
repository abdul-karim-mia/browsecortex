/**
 * Unit tests for displayLines utility functions
 * Tests the core message → ChatLine conversion pipeline
 */

import { describe, it, expect } from 'vitest';
import { messagesToLines, groupLines } from '../displayLines';
import type { Message } from '@/types';
import type { ChatLine } from '../../types/chat';

describe('messagesToLines', () => {
  it('converts user messages correctly', () => {
    const messages: Message[] = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString(),
      },
    ];

    const lines = messagesToLines(messages);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      role: 'user',
      content: 'Hello',
      messageId: 'msg1',
      pinned: undefined,
    });
  });

  it('includes reasoning in thinking line before assistant message', () => {
    const messages: Message[] = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        role: 'assistant',
        content: 'Response',
        reasoning: 'Let me think...',
        reasoningMs: 1500,
        createdAt: new Date().toISOString(),
      },
    ];

    const lines = messagesToLines(messages);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      role: 'thinking',
      content: 'Let me think...',
      thinkingMs: 1500,
    });
    expect(lines[1]).toEqual({
      role: 'assistant',
      content: 'Response',
      messageId: 'msg1',
      pinned: undefined,
    });
  });

  it('pairs tool results with their call information', () => {
    const messages: Message[] = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        role: 'assistant',
        content: 'I will call a tool',
        toolCalls: [{ id: 'call1', name: 'get_weather', arguments: { city: 'NYC' } }],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg2',
        conversationId: 'conv1',
        role: 'tool',
        content: 'Weather: Sunny',
        toolResult: { toolCallId: 'call1', content: 'Weather: Sunny', isError: false },
        createdAt: new Date().toISOString(),
      },
    ];

    const lines = messagesToLines(messages);

    // Should have: assistant message + tool result
    const toolLine = lines.find((l) => l.role === 'tool');
    expect(toolLine).toBeDefined();
    expect(toolLine?.tool?.name).toBe('get_weather');
    expect(toolLine?.args).toEqual({ city: 'NYC' });
    expect(toolLine?.tool?.isError).toBe(false);
  });

  it('marks error results correctly', () => {
    const messages: Message[] = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        role: 'tool',
        content: JSON.stringify({ error: 'Tool failed' }),
        toolResult: { toolCallId: 'call1', content: JSON.stringify({ error: 'Tool failed' }), isError: true },
        createdAt: new Date().toISOString(),
      },
    ];

    const lines = messagesToLines(messages);
    const toolLine = lines[0];

    expect(toolLine.tool?.isError).toBe(true);
  });

  it('handles pinned messages', () => {
    const messages: Message[] = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        role: 'user',
        content: 'Important message',
        pinned: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const lines = messagesToLines(messages);

    expect(lines[0].pinned).toBe(true);
  });
});

describe('groupLines', () => {
  it('groups consecutive thinking and tool lines into working blocks', () => {
    const lines: ChatLine[] = [
      { role: 'thinking', content: 'Hmm...' },
      { role: 'tool', content: 'result', tool: { name: 'tool1' } },
      { role: 'thinking', content: 'Now...' },
      { role: 'assistant', content: 'Final answer' },
    ];

    const blocks = groupLines(lines);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('working');
    expect((blocks[0] as any).lines).toHaveLength(3); // thinking + tool + thinking
    expect(blocks[1].kind).toBe('message');
    expect((blocks[1] as any).line.role).toBe('assistant');
  });

  it('creates separate working blocks when separated by messages', () => {
    const lines: ChatLine[] = [
      { role: 'thinking', content: 'First thought' },
      { role: 'user', content: 'User message' },
      { role: 'tool', content: 'result', tool: { name: 'tool1' } },
    ];

    const blocks = groupLines(lines);

    expect(blocks).toHaveLength(3);
    expect(blocks[0].kind).toBe('working');
    expect(blocks[1].kind).toBe('message');
    expect(blocks[2].kind).toBe('working');
  });

  it('handles empty lines', () => {
    const blocks = groupLines([]);
    expect(blocks).toHaveLength(0);
  });

  it('preserves order of messages', () => {
    const lines: ChatLine[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
      { role: 'user', content: 'msg3' },
    ];

    const blocks = groupLines(lines);

    expect(blocks).toHaveLength(3);
    expect((blocks[0] as any).line.content).toBe('msg1');
    expect((blocks[1] as any).line.content).toBe('msg2');
    expect((blocks[2] as any).line.content).toBe('msg3');
  });
});
