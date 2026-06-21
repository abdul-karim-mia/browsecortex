/**
 * use_agent (PLAN §21). Runs the agent loop headlessly for an external MCP
 * agent and returns the final assistant text. ask_user is auto-declined since
 * there's no interactive user in this path.
 */
import { runAgentLoop } from '@/agent/loop';
import { resolveActive } from '@/agent/resolve';
import { getApiHistory, persistNewTurns, ensureConversation } from '@/conversations/manager';
import { Storage } from '@/storage';
import type { ServerMessage } from '@/background/protocol';

const EXTERNAL_CONVERSATION = 'mcp-external-agent';

export async function runUseAgent(prompt: string): Promise<{ result: string } | { error: string }> {
  if (!prompt.trim()) return { error: 'prompt is required.' };

  const resolved = await resolveActive();
  if ('error' in resolved) return { error: resolved.error };

  await ensureConversation(EXTERNAL_CONVERSATION, resolved.provider, resolved.model.id);
  const history = await getApiHistory(EXTERNAL_CONVERSATION);
  const settings = await Storage.settings.get();

  let output = '';
  const emit = (msg: ServerMessage) => {
    if (msg.type === 'token') output += msg.content;
    if (msg.type === 'error') output += `\n[error] ${msg.message}`;
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const { messages, outcome } = await runAgentLoop({
      provider: resolved.provider,
      model: resolved.model,
      settings,
      history,
      userContent: prompt,
      conversationId: EXTERNAL_CONVERSATION,
      signal: controller.signal,
      emit,
      askUser: async () => ({}), // no interactive user; decline/empty
    });
    await persistNewTurns(EXTERNAL_CONVERSATION, messages, history.length);
    if (outcome === 'error') return { error: output.trim() || 'Agent error.' };
    return { result: output.trim() };
  } finally {
    clearTimeout(timeout);
  }
}
