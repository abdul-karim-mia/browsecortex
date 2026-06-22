/**
 * Conversation auto-naming (PLAN §8). After the first exchange, ask the model
 * for a short title. Falls back to a truncated first message on any failure.
 */
import type { Model, Provider } from '@/types';
import type { ApiMessage } from '@/providers/chat-types';
import { streamChat } from '@/providers/chat';
import { Storage } from '@/storage';

function fallbackName(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean || 'New conversation';
}

export async function autoName(
  conversationId: string,
  provider: Provider,
  model: Model,
  firstUser: string,
  firstAssistant: string,
): Promise<void> {
  const conv = await Storage.conversations.get(conversationId);
  if (!conv || conv.name !== 'New conversation') return; // already named

  let name = fallbackName(firstUser);
  try {
    const prompt: ApiMessage[] = [
      {
        role: 'system',
        content: 'Generate a 3-6 word title for this conversation. Reply with only the title.',
      },
      { role: 'user', content: `User: ${firstUser}\nAssistant: ${firstAssistant}`.slice(0, 2000) },
    ];
    let title = '';
    const controller = new AbortController();
    // Bound this call — it runs after the visible reply is already done, so a
    // stalled provider stream here must not hang the background handler and
    // leave it permanently "running" for the rest of the panel session.
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      for await (const ev of streamChat({
        provider,
        model,
        messages: prompt,
        signal: controller.signal,
      })) {
        if (ev.type === 'token') title += ev.content;
      }
    } finally {
      clearTimeout(timeout);
    }
    const trimmed = title.trim().replace(/^["']|["']$/g, '');
    if (trimmed) name = trimmed.slice(0, 60);
  } catch {
    // keep fallback
  }

  conv.name = name;
  await Storage.conversations.save(conv);
}
