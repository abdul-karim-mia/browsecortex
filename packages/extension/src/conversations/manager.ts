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
