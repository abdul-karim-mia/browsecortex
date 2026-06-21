/**
 * Typed storage facade (PLAN §4).
 *
 * The single entry point for all persistence. UI and background code call
 * `Storage.*` — never Dexie or chrome.storage directly. Small, fast-access
 * data (settings, providers, models) lives in chrome.storage.local; bulk data
 * (conversations, messages, memories, tasks, files) lives in IndexedDB.
 */
import { db } from '@/db';
import * as local from '@/storage/local';
import {
  DEFAULT_SETTINGS,
  type Conversation,
  type Memory,
  type Message,
  type Model,
  type Provider,
  type Settings,
  type Task,
  type VFile,
} from '@/types';

const KEYS = {
  settings: 'settings',
  providers: 'providers',
  models: 'models',
} as const;

export const Storage = {
  // ── Settings ────────────────────────────────────────────────────
  settings: {
    async get(): Promise<Settings> {
      const stored = await local.get<Partial<Settings>>(KEYS.settings);
      return { ...DEFAULT_SETTINGS, ...stored };
    },
    async update(patch: Partial<Settings>): Promise<Settings> {
      const next = { ...(await this.get()), ...patch };
      await local.set(KEYS.settings, next);
      return next;
    },
  },

  // ── Providers (PLAN §5) ─────────────────────────────────────────
  providers: {
    async list(): Promise<Provider[]> {
      return (await local.get<Provider[]>(KEYS.providers)) ?? [];
    },
    async get(id: string): Promise<Provider | undefined> {
      return (await this.list()).find((p) => p.id === id);
    },
    async save(provider: Provider): Promise<void> {
      const all = await this.list();
      const idx = all.findIndex((p) => p.id === provider.id);
      if (idx >= 0) all[idx] = provider;
      else all.push(provider);
      await local.set(KEYS.providers, all);
    },
    async remove(id: string): Promise<void> {
      const removed = await this.get(id);
      const all = (await this.list()).filter((p) => p.id !== id);
      await local.set(KEYS.providers, all);

      // Drop the deleted provider's models (PLAN §44).
      const models = (await local.get<Model[]>(KEYS.models)) ?? [];
      await local.set(
        KEYS.models,
        models.filter((m) => m.providerId !== id),
      );

      // If it was the active selection, reassign to a remaining provider so the
      // app keeps working instead of erroring (PLAN §44).
      const settings = await local.get<Partial<Settings>>(KEYS.settings);
      if (settings?.selectedProviderId === id) {
        const next = all[0]?.id ?? null;
        await local.set(KEYS.settings, {
          ...settings,
          selectedProviderId: next,
          selectedModel: null,
        });
      }

      // Mark conversations that referenced it as orphaned, preserving the name
      // so history stays readable (PLAN §44).
      if (removed) {
        await db.conversations
          .filter((c) => c.providerId === id)
          .modify({ providerName: `${removed.name} (deleted)` });
      }
    },
  },

  // ── Models (PLAN §6) ────────────────────────────────────────────
  models: {
    async list(): Promise<Model[]> {
      return (await local.get<Model[]>(KEYS.models)) ?? [];
    },
    async listByProvider(providerId: string): Promise<Model[]> {
      return (await this.list()).filter((m) => m.providerId === providerId);
    },
    async setForProvider(providerId: string, models: Model[]): Promise<void> {
      const others = (await this.list()).filter((m) => m.providerId !== providerId);
      await local.set(KEYS.models, [...others, ...models]);
    },
  },

  // ── Conversations (PLAN §8) ─────────────────────────────────────
  conversations: {
    async list(limit = 20, offset = 0): Promise<Conversation[]> {
      return db.conversations.orderBy('updatedAt').reverse().offset(offset).limit(limit).toArray();
    },
    get: (id: string) => db.conversations.get(id),
    save: (c: Conversation) => db.conversations.put(c),
    async remove(id: string): Promise<void> {
      // Remove the conversation and its scoped messages + files (PLAN §8, §44).
      // Tasks are kept but detached so the history isn't lost.
      await db.transaction('rw', db.conversations, db.messages, db.files, db.tasks, async () => {
        await db.messages.where('conversationId').equals(id).delete();
        await db.files.where('conversationId').equals(id).delete();
        await db.tasks
          .where('conversationId')
          .equals(id)
          .modify({ conversationId: null });
        await db.conversations.delete(id);
      });
    },
    async search(query: string): Promise<Conversation[]> {
      const q = query.toLowerCase();
      return db.conversations.filter((c) => c.name.toLowerCase().includes(q)).toArray();
    },
  },

  // ── Messages (PLAN §8) ──────────────────────────────────────────
  messages: {
    byConversation: (conversationId: string) =>
      db.messages.where('conversationId').equals(conversationId).sortBy('createdAt'),
    save: (m: Message) => db.messages.put(m),
    remove: (id: string) => db.messages.delete(id),
  },

  // ── Memories (PLAN §12) ─────────────────────────────────────────
  memories: {
    list: () => db.memories.toArray(),
    save: (m: Memory) => db.memories.put(m),
    remove: (id: string) => db.memories.delete(id),
  },

  // ── Tasks (PLAN §13) ────────────────────────────────────────────
  tasks: {
    list: () => db.tasks.toArray(),
    byConversation: (conversationId: string) =>
      db.tasks.where('conversationId').equals(conversationId).toArray(),
    save: (t: Task) => db.tasks.put(t),
    remove: (id: string) => db.tasks.delete(id),
  },

  // ── Virtual filesystem (PLAN §14) ───────────────────────────────
  files: {
    list: () => db.files.toArray(),
    get: (id: string) => db.files.get(id),
    byConversation: (conversationId: string) =>
      db.files.where('conversationId').equals(conversationId).toArray(),
    byParent: (parentId: string | null) =>
      db.files.filter((f) => f.parentId === parentId).toArray(),
    save: (f: VFile) => db.files.put(f),
    remove: (id: string) => db.files.delete(id),
  },
};
