/**
 * Mapping between stored Messages (IndexedDB / UI) and the OpenAI-compatible
 * ApiMessages used by the agent loop (PLAN §8, §9).
 *
 * Each API turn is stored as its own Message so history can be rebuilt with
 * full fidelity — an assistant tool-call message and each tool result are
 * distinct rows.
 */
import type { Message, ToolCall } from '@/types';
import type { ApiMessage, ApiToolCall } from '@/providers/chat-types';

/** Stored Message → ApiMessage for sending back to the provider. */
export function toApiMessage(m: Message): ApiMessage | null {
  switch (m.role) {
    case 'user':
      return { role: 'user', content: m.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map(
                (tc): ApiToolCall => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                }),
              ),
            }
          : {}),
      };
    case 'tool':
      if (!m.toolResult) return null;
      return { role: 'tool', tool_call_id: m.toolResult.toolCallId, content: m.toolResult.content };
    default:
      return null; // system messages are rebuilt fresh each turn
  }
}

export function buildApiHistory(messages: Message[]): ApiMessage[] {
  return messages.map(toApiMessage).filter((m): m is ApiMessage => m !== null);
}

/** ApiMessage → stored Message (system messages are skipped by the caller). */
export function fromApiMessage(m: ApiMessage, conversationId: string): Message | null {
  const base = {
    id: crypto.randomUUID(),
    conversationId,
    createdAt: new Date().toISOString(),
  };
  switch (m.role) {
    case 'user':
      // Flatten multimodal content (PLAN §15) to text for storage — image bytes
      // aren't persisted; text parts are kept and images noted by placeholder.
      return {
        ...base,
        role: 'user',
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content
                .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
                .join('\n'),
      };
    case 'assistant': {
      const toolCalls: ToolCall[] | undefined = m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParse(tc.function.arguments),
      }));
      return { ...base, role: 'assistant', content: m.content ?? '', toolCalls };
    }
    case 'tool':
      return {
        ...base,
        role: 'tool',
        content: '',
        toolResult: { toolCallId: m.tool_call_id, content: m.content },
      };
    default:
      return null;
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
