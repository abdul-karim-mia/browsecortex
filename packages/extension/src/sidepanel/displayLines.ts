/**
 * Convert stored Messages into the flat display lines the chat renders.
 * Tool result rows borrow their tool name from the preceding assistant turn's
 * tool_calls, since the stored tool message only carries the call id.
 */
import type { Message } from '@/types';

export interface ChatLine {
  role: 'user' | 'assistant' | 'tool' | 'thinking';
  content: string;
  /** For thinking lines: true while reasoning tokens are still streaming in. */
  streaming?: boolean;
  /** Tool-call id, used to attach the matching result to the right row. */
  id?: string;
  /** Stored message id (present once persisted) — enables pin/delete. */
  messageId?: string;
  pinned?: boolean;
  /** For tool lines: the request arguments shown alongside the result. */
  args?: Record<string, unknown>;
  tool?: { name: string; isError?: boolean };
}

export function messagesToLines(messages: Message[]): ChatLine[] {
  const lines: ChatLine[] = [];
  const callInfo = new Map<string, { name: string; args: Record<string, unknown> }>();

  for (const m of messages) {
    if (m.role === 'user') {
      lines.push({ role: 'user', content: m.content, messageId: m.id, pinned: m.pinned });
    } else if (m.role === 'assistant') {
      for (const tc of m.toolCalls ?? [])
        callInfo.set(tc.id, { name: tc.name, args: tc.arguments });
      if (m.content.trim())
        lines.push({ role: 'assistant', content: m.content, messageId: m.id, pinned: m.pinned });
    } else if (m.role === 'tool' && m.toolResult) {
      const info = callInfo.get(m.toolResult.toolCallId);
      lines.push({
        role: 'tool',
        content: m.toolResult.content,
        args: info?.args,
        tool: {
          name: info?.name ?? 'tool',
          isError: isErrorResult(m.toolResult.content),
        },
      });
    }
  }
  return lines;
}

function isErrorResult(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return 'error' in parsed;
  } catch {
    return false;
  }
}
