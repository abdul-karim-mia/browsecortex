/**
 * Convert stored Messages into the flat display lines the chat renders.
 * Tool result rows borrow their tool name from the preceding assistant turn's
 * tool_calls, since the stored tool message only carries the call id.
 */
import type { Message } from '@/types';
import type { ChatLine } from '../types/chat';

// Note: ChatLine is now imported from types/chat.ts
// Type definition moved there for better organization

export type Block =
  | { kind: 'working'; lines: ChatLine[] }
  | { kind: 'message'; line: ChatLine };

/** Group consecutive tool/thinking lines into one "working" block,
 * so reasoning and tool calls before the final reply render as a single
 * collapsible section instead of separate disjoint boxes. */
export function groupLines(lines: ChatLine[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.role === 'tool' || line.role === 'thinking') {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'working') last.lines.push(line);
      else blocks.push({ kind: 'working', lines: [line] });
    } else {
      blocks.push({ kind: 'message', line });
    }
  }
  return blocks;
}

export function messagesToLines(messages: Message[]): ChatLine[] {
  const lines: ChatLine[] = [];
  const callInfo = new Map<string, { name: string; args: Record<string, unknown> }>();

  for (const m of messages) {
    if (m.role === 'user') {
      lines.push({ role: 'user', content: m.content, messageId: m.id, pinned: m.pinned });
    } else if (m.role === 'assistant') {
      // Reasoning precedes the round's tool calls / reply, so emit it first.
      if (m.reasoning)
        lines.push({ role: 'thinking', content: m.reasoning, thinkingMs: m.reasoningMs });
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
