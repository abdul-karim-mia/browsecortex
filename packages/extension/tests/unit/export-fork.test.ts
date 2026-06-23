import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Conversation, Message } from '@/types';

// In-memory stand-ins for the Storage layers export/fork build on.
const convs = new Map<string, Conversation>();
const msgs = new Map<string, Message>();

vi.mock('@/storage', () => ({
  Storage: {
    conversations: {
      get: async (id: string) => convs.get(id),
      save: async (c: Conversation) => void convs.set(c.id, c),
    },
    messages: {
      byConversation: async (cid: string) =>
        [...msgs.values()]
          .filter((m) => m.conversationId === cid)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      save: async (m: Message) => void msgs.set(m.id, m),
    },
  },
}));

import { toJson, toMarkdown, buildExport } from '@/conversations/export';
import { forkConversation } from '@/conversations/manager';

const conv: Conversation = {
  id: 'c1',
  name: 'My Chat',
  starred: false,
  pinned: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  providerId: 'p1',
  model: 'gpt',
  taskIds: [],
  messageCount: 0,
};

function msg(id: string, role: Message['role'], content: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: 'c1',
    role,
    content,
    createdAt: `2024-01-01T00:00:0${id.length}.000Z`,
    ...extra,
  };
}

beforeEach(() => {
  convs.clear();
  msgs.clear();
  convs.set(conv.id, { ...conv });
});

describe('conversation export', () => {
  it('renders markdown with user and assistant sections', () => {
    const md = toMarkdown({
      conversation: conv,
      messages: [msg('1', 'user', 'hi'), msg('2', 'assistant', 'hello there')],
    });
    expect(md).toContain('# My Chat');
    expect(md).toContain('### 🧑 User');
    expect(md).toContain('hello there');
  });

  it('round-trips JSON', () => {
    const data = { conversation: conv, messages: [msg('1', 'user', 'hi')] };
    expect(JSON.parse(toJson(data)).messages[0].content).toBe('hi');
  });

  it('buildExport produces a sanitized filename', async () => {
    msgs.set('1', msg('1', 'user', 'hi'));
    const out = await buildExport('c1', 'markdown');
    expect(out?.filename).toBe('My-Chat.md');
    expect(out?.mime).toBe('text/markdown');
  });
});

describe('forkConversation', () => {
  it('copies messages up to and including the target into a new conversation', async () => {
    msgs.set('1', msg('1', 'user', 'first'));
    msgs.set('2', msg('2', 'assistant', 'reply'));
    msgs.set('3', msg('3', 'user', 'second'));

    const forkId = await forkConversation('c1', '2');
    expect(forkId).toBeTruthy();
    const forked = [...msgs.values()].filter((m) => m.conversationId === forkId);
    expect(forked.map((m) => m.content)).toEqual(['first', 'reply']);
    expect(convs.get(forkId!)?.name).toBe('My Chat (fork)');
  });

  it('drops a trailing assistant turn with unanswered tool calls', async () => {
    msgs.set('1', msg('1', 'user', 'do it'));
    msgs.set(
      '2',
      msg('2', 'assistant', '', { toolCalls: [{ id: 't', name: 'click', arguments: {} }] }),
    );
    const forkId = await forkConversation('c1', '2');
    const forked = [...msgs.values()].filter((m) => m.conversationId === forkId);
    expect(forked.map((m) => m.content)).toEqual(['do it']);
  });
});
