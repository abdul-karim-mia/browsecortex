import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, type Model, type Provider } from '@/types';

// Capture every streamChat call so we can inspect the toolset each (sub)agent
// was given. The mock branches on whether `spawn_agent` is in the toolset:
// only the top-level agent has it, so its absence identifies a subagent run.
const h = vi.hoisted(() => ({ calls: [] as { tools?: { function: { name: string } }[] }[] }));

vi.mock('@/providers/chat', () => ({
  ChatHttpError: class ChatHttpError extends Error {},
  async *streamChat(opts: {
    tools?: { function: { name: string } }[];
    messages: { role: string }[];
  }) {
    h.calls.push(opts);
    const isTopLevel = opts.tools?.some((t) => t.function.name === 'spawn_agent');

    if (!isTopLevel) {
      // Subagent: answer directly, no tool calls.
      yield { type: 'token' as const, content: 'Found 3 Rust posts: A, B, C.' };
      return;
    }
    // Top-level: first turn delegates, second turn (after the tool result) ends.
    const sawToolResult = opts.messages.some((m) => m.role === 'tool');
    if (!sawToolResult) {
      yield {
        type: 'tool_calls' as const,
        calls: [
          {
            id: 'call_1',
            name: 'spawn_agent',
            arguments: JSON.stringify({ agent_type: 'researcher', task: 'find rust posts' }),
          },
        ],
      };
    } else {
      yield { type: 'token' as const, content: 'Delegated and summarized.' };
    }
  },
}));

vi.mock('@/memory/retrieval', () => ({ retrieveMemories: async () => [] }));
vi.mock('@/mcp/integration', () => ({
  getMcpApiTools: async () => [],
  isMcpTool: () => false,
  executeMcpTool: async () => ({}),
}));
vi.mock('@/agent/compaction', () => ({
  shouldCompact: () => false,
  compact: async (b: unknown) => b,
}));
vi.mock('@/storage', () => ({ Storage: { models: { listByProvider: async () => [] } } }));

// Minimal chrome stub (no tool here touches a tab, but ctx construction is safe).
(globalThis as { chrome?: unknown }).chrome = {
  tabs: { query: async () => [{ id: 1 }] },
};

import { runAgentLoop } from '@/agent/loop';

const provider = { id: 'p', name: 'Test', baseUrl: 'http://x' } as unknown as Provider;
const model = {
  id: 'm',
  providerId: 'p',
  enabled: true,
  hasToolCalling: true,
  capabilitySource: 'user',
} as Model;

beforeEach(() => {
  h.calls.length = 0;
});

describe('subagent delegation', () => {
  it('runs spawn_agent, sandboxes the subagent, and folds its summary back', async () => {
    const result = await runAgentLoop({
      provider,
      model,
      settings: { ...DEFAULT_SETTINGS, agentMode: 'full_auto' },
      history: [],
      userContent: 'Research Rust posts',
      conversationId: 'c1',
      signal: new AbortController().signal,
      emit: () => {},
      askUser: async () => ({}),
    });

    expect(result.outcome).toBe('completed');

    // Two top-level streamChat calls (delegate, then finish) + one subagent call.
    const subCall = h.calls.find((c) => !c.tools?.some((t) => t.function.name === 'spawn_agent'));
    expect(subCall).toBeDefined();
    const subToolNames = subCall!.tools!.map((t) => t.function.name);

    // Subagent got the researcher's read-only toolset…
    expect(subToolNames).toContain('read_page_content');
    // …and NOT destructive/out-of-scope tools…
    expect(subToolNames).not.toContain('close_tab');
    expect(subToolNames).not.toContain('submit_form');
    // …and crucially cannot spawn further subagents.
    expect(subToolNames).not.toContain('spawn_agent');

    // The subagent's summary is handed back to the parent as a tool result.
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(JSON.stringify(toolMsg!.content)).toContain('Found 3 Rust posts');
  });
});
