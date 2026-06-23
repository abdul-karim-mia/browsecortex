import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, type AgentMode, type Model, type Provider } from '@/types';

// streamChat emits one destructive tool call (delete_memory) on the first turn,
// then ends after the tool result — enough to exercise the permission gate.
vi.mock('@/providers/chat', () => ({
  ChatHttpError: class ChatHttpError extends Error {},
  async *streamChat(opts: { messages: { role: string }[] }) {
    const sawToolResult = opts.messages.some((m) => m.role === 'tool');
    if (!sawToolResult) {
      yield {
        type: 'tool_calls' as const,
        calls: [{ id: 'call_1', name: 'delete_memory', arguments: JSON.stringify({ id: 'm1' }) }],
      };
    } else {
      yield { type: 'token' as const, content: 'done' };
    }
  },
}));

vi.mock('@/memory/retrieval', () => ({ retrieveMemories: async () => [] }));
vi.mock('@/mcp/integration', () => ({
  getMcpApiTools: async () => [],
  isMcpTool: () => false,
  executeMcpTool: async () => ({}),
}));
vi.mock('@/agent/compaction', () => ({ shouldCompact: () => false, compact: async (b: unknown) => b }));
// delete_memory's executor just needs Storage.memories.remove to resolve.
vi.mock('@/storage', () => ({
  Storage: { models: { listByProvider: async () => [] }, memories: { remove: async () => {} } },
}));

(globalThis as { chrome?: unknown }).chrome = { tabs: { query: async () => [{ id: 1 }] } };

import { runAgentLoop } from '@/agent/loop';

const provider = { id: 'p', name: 'Test', baseUrl: 'http://x' } as unknown as Provider;
const model = {
  id: 'm',
  providerId: 'p',
  enabled: true,
  hasToolCalling: true,
  capabilitySource: 'user',
} as Model;

async function run(mode: AgentMode, ask: () => Promise<Record<string, unknown>>) {
  const askUser = vi.fn(ask);
  const result = await runAgentLoop({
    provider,
    model,
    settings: { ...DEFAULT_SETTINGS, agentMode: mode },
    history: [],
    userContent: 'delete it',
    conversationId: 'c1',
    signal: new AbortController().signal,
    emit: () => {},
    askUser,
  });
  const toolMsg = result.messages.find((m) => m.role === 'tool');
  return { askUser, toolContent: JSON.stringify(toolMsg?.content ?? '') };
}

beforeEach(() => vi.clearAllMocks());

describe('permission mode gate', () => {
  it('ask: prompts and blocks the action when denied', async () => {
    const { askUser, toolContent } = await run('ask', async () => ({ decision: 'Deny' }));
    expect(askUser).toHaveBeenCalledOnce();
    expect(toolContent).toContain('User declined this action');
  });

  it('ask: prompts and runs the action when allowed', async () => {
    const { askUser, toolContent } = await run('ask', async () => ({ decision: 'Allow' }));
    expect(askUser).toHaveBeenCalledOnce();
    expect(toolContent).not.toContain('User declined');
  });

  it('bypass: never prompts', async () => {
    const { askUser } = await run('bypass', async () => ({ decision: 'Deny' }));
    expect(askUser).not.toHaveBeenCalled();
  });

  it('auto: does not prompt for a destructive action without external content read', async () => {
    const { askUser } = await run('auto', async () => ({ decision: 'Deny' }));
    expect(askUser).not.toHaveBeenCalled();
  });
});
