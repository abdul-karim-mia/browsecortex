/**
 * Conversation export (PLAN Future Considerations — B1). Renders a conversation
 * and its messages to Markdown or JSON for download. Pure string builders so
 * they're easy to unit-test; the UI handles the actual file download.
 */
import { Storage } from '@/storage';
import type { Conversation, Message } from '@/types';

export interface ConversationExport {
  conversation: Conversation;
  messages: Message[];
}

async function load(conversationId: string): Promise<ConversationExport | null> {
  const conversation = await Storage.conversations.get(conversationId);
  if (!conversation) return null;
  const messages = await Storage.messages.byConversation(conversationId);
  return { conversation, messages };
}

export function toJson(data: ConversationExport): string {
  return JSON.stringify(data, null, 2);
}

export function toMarkdown(data: ConversationExport): string {
  const { conversation, messages } = data;
  const lines: string[] = [`# ${conversation.name}`, ''];
  lines.push(`_Exported ${new Date().toISOString()} · ${messages.length} messages_`, '');

  for (const m of messages) {
    if (m.role === 'user') {
      lines.push('### 🧑 User', '', m.content || '', '');
    } else if (m.role === 'assistant') {
      lines.push('### 🤖 Assistant', '');
      if (m.content) lines.push(m.content, '');
      for (const tc of m.toolCalls ?? []) {
        lines.push(`- 🔧 \`${tc.name}(${JSON.stringify(tc.arguments)})\``);
      }
      if (m.toolCalls?.length) lines.push('');
    } else if (m.role === 'tool' && m.toolResult) {
      const body = m.toolResult.content.slice(0, 2000);
      lines.push('<details><summary>🔧 tool result</summary>', '', '```json', body, '```', '', '</details>', '');
    }
  }
  return lines.join('\n');
}

export type ExportFormat = 'markdown' | 'json';

/** Build the export string + a suggested filename for the given format. */
export async function buildExport(
  conversationId: string,
  format: ExportFormat,
): Promise<{ content: string; filename: string; mime: string } | null> {
  const data = await load(conversationId);
  if (!data) return null;
  const safeName =
    data.conversation.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
    'conversation';
  if (format === 'json') {
    return { content: toJson(data), filename: `${safeName}.json`, mime: 'application/json' };
  }
  return { content: toMarkdown(data), filename: `${safeName}.md`, mime: 'text/markdown' };
}
