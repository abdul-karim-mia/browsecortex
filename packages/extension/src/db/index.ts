import Dexie, { type Table } from 'dexie';
import type { Conversation, Message, VFile, Memory, Task } from '@/types';

/**
 * IndexedDB layer (PLAN §4, §25, §42).
 * chrome.storage.local holds settings/providers; bulk data lives here.
 *
 * Schema versions are additive — never delete fields. Each bump needs an
 * upgrade function (PLAN §42).
 */
export class BrowseCortexDB extends Dexie {
  conversations!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  files!: Table<VFile, string>;
  memories!: Table<Memory, string>;
  tasks!: Table<Task, string>;

  constructor() {
    super('browsecortex');
    this.version(1).stores({
      conversations: 'id, updatedAt, starred, pinned',
      messages: 'id, conversationId, createdAt',
      files: 'id, path, parentId',
      memories: 'id, type, updatedAt, conversationId',
      tasks: 'id, status, conversationId',
    });
    // v2: scope the virtual filesystem per conversation (PLAN §14, §42).
    this.version(2)
      .stores({ files: 'id, path, parentId, conversationId' })
      .upgrade((tx) =>
        tx
          .table('files')
          .toCollection()
          .modify((f: { conversationId?: string }) => {
            // Legacy global files keep working under a reserved namespace.
            if (f.conversationId === undefined) f.conversationId = 'legacy';
          }),
      );
  }
}

export const db = new BrowseCortexDB();

/**
 * Opens the database, surfacing migration/eviction failures so the UI can show
 * a recovery screen instead of silently breaking (PLAN §41, §42).
 */
export async function checkDbHealth(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.open();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
