/**
 * Cross-session conversation summarization (B6). Distinct from §31 compaction:
 * compaction runs mid-task on the live message array; this produces a durable
 * synopsis stored on the conversation, shown in the drawer and (optionally)
 * prepended to context when the conversation is resumed.
 */
import { Storage } from '@/storage';
import { resolveActive } from '@/agent/resolve';
import { streamChat } from '@/providers/chat';
import type { ApiMessage } from '@/providers/chat-types';
import type { Message } from '@/types';

/** Flatten stored messages into a compact transcript for the summarizer. */
function transcript(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'user') lines.push(`User: ${m.content}`);
    else if (m.role === 'assistant' && m.content) lines.push(`Assistant: ${m.content}`);
    else if (m.role === 'assistant' && m.toolCalls?.length)
      lines.push(`Assistant used tools: ${m.toolCalls.map((t) => t.name).join(', ')}`);
  }
  // Keep the request bounded regardless of conversation length.
  return lines.join('\n').slice(0, 12_000);
}

/**
 * Generate and persist a synopsis for a conversation. Returns the summary, or
 * null if there's nothing to summarize or no provider is configured.
 */
export async function summarizeConversation(conversationId: string): Promise<string | null> {
  const conv = await Storage.conversations.get(conversationId);
  if (!conv) return null;
  const messages = await Storage.messages.byConversation(conversationId);
  if (messages.length === 0) return null;

  const resolved = await resolveActive();
  if ('error' in resolved) return null;

  const prompt: ApiMessage[] = [
    {
      role: 'system',
      content:
        'Summarize this conversation in 3-5 sentences: the goal, key decisions, and outcomes. ' +
        'Write it so it can be used as context to resume the conversation later. Reply with only the summary.',
    },
    { role: 'user', content: transcript(messages) },
  ];

  let summary = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    for await (const ev of streamChat({
      provider: resolved.provider,
      model: resolved.model,
      messages: prompt,
      signal: controller.signal,
    })) {
      if (ev.type === 'token') summary += ev.content;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const trimmed = summary.trim();
  if (!trimmed) return null;
  await Storage.conversations.save({ ...conv, summary: trimmed });
  return trimmed;
}
