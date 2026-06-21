/**
 * Context compaction (PLAN §31). Estimates token usage and, past the threshold,
 * summarizes older turns into a single message to free up context. The most
 * recent turns and the original task are preserved.
 */
import type { Model, Provider, Settings } from '@/types';
import type { ApiMessage } from '@/providers/chat-types';
import { streamChat } from '@/providers/chat';

const KEEP_RECENT = 5;

/** Cheap token estimate: ~4 chars per token (PLAN §31). */
export function estimateTokens(messages: ApiMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) chars += tc.function.arguments.length + tc.function.name.length;
    }
  }
  return Math.ceil(chars / 4);
}

export function shouldCompact(messages: ApiMessage[], settings: Settings, model: Model): boolean {
  if (!settings.compactionEnabled || !model.contextWindow) return false;
  return estimateTokens(messages) > model.contextWindow * settings.compactionThreshold;
}

/**
 * Returns a new message list with older turns replaced by a summary. `messages`
 * excludes the system message (caller re-prepends it). Returns the input
 * unchanged if there is too little to compact or the summary call fails.
 */
export async function compact(
  messages: ApiMessage[],
  provider: Provider,
  model: Model,
  signal: AbortSignal,
  pinnedContents: string[] = [],
): Promise<ApiMessage[]> {
  // Keep the first user turn (original task) and the last N turns.
  const firstUserIdx = messages.findIndex((m) => m.role === 'user');
  if (firstUserIdx < 0) return messages;

  const head = messages.slice(0, firstUserIdx + 1);
  const tail = messages.slice(Math.max(firstUserIdx + 1, messages.length - KEEP_RECENT));
  const rawMiddle = messages.slice(firstUserIdx + 1, messages.length - KEEP_RECENT);
  // Never compact pinned messages (PLAN §31) — preserve them verbatim.
  const pinned = new Set(pinnedContents);
  const preserved = rawMiddle.filter((m) => typeof m.content === 'string' && pinned.has(m.content));
  const middle = rawMiddle.filter((m) => !(typeof m.content === 'string' && pinned.has(m.content)));
  if (middle.length < 4) return messages; // not worth compacting

  const transcript = middle
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : '[tool call]'}`)
    .join('\n');

  const summaryPrompt: ApiMessage[] = [
    {
      role: 'system',
      content:
        'Summarize the following conversation excerpt into a concise note capturing key facts, ' +
        'decisions, and outcomes. This replaces the original turns to save context.',
    },
    { role: 'user', content: transcript },
  ];

  let summary = '';
  try {
    for await (const ev of streamChat({ provider, model, messages: summaryPrompt, signal })) {
      if (ev.type === 'token') summary += ev.content;
    }
  } catch {
    return messages; // on failure, keep the full history
  }
  if (!summary.trim()) return messages;

  return [
    ...head,
    ...preserved,
    { role: 'assistant', content: `[Earlier conversation summarized]\n${summary}` },
    ...tail,
  ];
}
