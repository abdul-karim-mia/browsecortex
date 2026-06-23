/**
 * Conversation persistence (PLAN §8). Create/load conversations, persist
 * messages, and rebuild API history from storage.
 */
import { Storage } from '@/storage';
import type { Conversation, Message, Provider } from '@/types';
import type { ApiMessage } from '@/providers/chat-types';
import { buildApiHistory, fromApiMessage } from './mappers';

export async function createConversation(provider: Provider, model: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    name: 'New conversation',
    starred: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    providerId: provider.id,
    providerName: provider.name,
    model,
    taskIds: [],
    messageCount: 0,
  };
  await Storage.conversations.save(conversation);
  return conversation;
}

/** Ensure a conversation row exists for the given id, creating it if missing. */
export async function ensureConversation(
  id: string,
  provider: Provider,
  model: string,
): Promise<Conversation> {
  const existing = await Storage.conversations.get(id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id,
    name: 'New conversation',
    starred: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    providerId: provider.id,
    providerName: provider.name,
    model,
    taskIds: [],
    messageCount: 0,
  };
  await Storage.conversations.save(conversation);
  return conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return Storage.messages.byConversation(conversationId);
}

/**
 * Fork a conversation at a given message (B1/B8). Creates a new conversation
 * containing copies of every message up to and including `messageId`, so the
 * user can branch off without disturbing the original.
 *
 * To keep the API history valid, a trailing assistant turn that still has
 * unanswered tool_calls (its tool results would live after the cut point) is
 * dropped from the fork — otherwise the next provider call would see an
 * assistant message with tool_calls and no matching tool responses.
 */
export async function forkConversation(
  sourceId: string,
  messageId: string,
): Promise<string | null> {
  const source = await Storage.conversations.get(sourceId);
  if (!source) return null;
  const all = await Storage.messages.byConversation(sourceId);
  const cut = all.findIndex((m) => m.id === messageId);
  if (cut < 0) return null;

  const slice = all.slice(0, cut + 1);
  // Drop a trailing assistant turn whose tool_calls have no following results.
  while (slice.length > 0) {
    const last = slice[slice.length - 1];
    if (last.role === 'assistant' && last.toolCalls && last.toolCalls.length > 0) {
      slice.pop();
    } else {
      break;
    }
  }
  if (slice.length === 0) return null;

  const now = Date.now();
  const forkId = crypto.randomUUID();
  const conversation: Conversation = {
    ...source,
    id: forkId,
    name: `${source.name} (fork)`,
    starred: false,
    pinned: false,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    taskIds: [],
    messageCount: slice.length,
  };
  await Storage.conversations.save(conversation);

  // Clone messages with fresh ids and strictly increasing timestamps so the
  // history reconstructs in the same order (see persistNewTurns' note).
  for (let i = 0; i < slice.length; i++) {
    const m = slice[i];
    await Storage.messages.save({
      ...m,
      id: crypto.randomUUID(),
      conversationId: forkId,
      createdAt: new Date(now + i).toISOString(),
    });
  }
  return forkId;
}

/** Rebuild the ApiMessage history (excludes the system prompt). */
export async function getApiHistory(conversationId: string): Promise<ApiMessage[]> {
  return buildApiHistory(await getMessages(conversationId));
}

export async function addMessage(message: Message): Promise<void> {
  await Storage.messages.save(message);
  const conv = await Storage.conversations.get(message.conversationId);
  if (conv) {
    conv.messageCount += 1;
    conv.updatedAt = new Date().toISOString();
    await Storage.conversations.save(conv);
  }
}

/**
 * Persist a run's newly produced API turns (everything after `priorCount`
 * pre-existing turns and the system message). Used after the agent loop.
 */
export async function persistNewTurns(
  conversationId: string,
  fullApiMessages: ApiMessage[],
  priorTurnCount: number,
): Promise<void> {
  // fullApiMessages[0] is the system message; skip it.
  const withoutSystem = fullApiMessages.filter((m) => m.role !== 'system');
  const newTurns = withoutSystem.slice(priorTurnCount);
  // Assign strictly increasing timestamps so byConversation's createdAt sort
  // can't tie-break same-millisecond turns by random id order (see
  // fromApiMessage's doc comment) — that reordering is what corrupts a
  // conversation's tool_calls/tool-result pairing for the API.
  const baseMs = Date.now();
  for (let i = 0; i < newTurns.length; i++) {
    const createdAt = new Date(baseMs + i).toISOString();
    const stored = fromApiMessage(newTurns[i], conversationId, createdAt);
    if (stored) await addMessage(stored);
  }
}
