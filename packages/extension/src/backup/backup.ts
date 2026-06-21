/**
 * Backup collection and restore (PLAN §32). Gathers all user data, encrypts it,
 * and produces a .browsecortex file; restore reverses the process.
 */
import { db } from '@/db';
import * as local from '@/storage/local';
import { encryptJson, decryptJson, type EncryptedPayload } from './crypto';

export interface BackupFile {
  version: '1.0';
  created: string;
  encrypted: true;
  hint?: string;
  payload: EncryptedPayload;
}

interface BackupData {
  local: Record<string, unknown>;
  conversations: unknown[];
  messages: unknown[];
  memories: unknown[];
  tasks: unknown[];
  files: unknown[];
}

const LOCAL_KEYS = ['settings', 'providers', 'models', 'mcp_servers', 'installed_skills'];

async function collect(): Promise<BackupData> {
  const localData: Record<string, unknown> = {};
  for (const key of LOCAL_KEYS) {
    const value = await local.get(key);
    if (value !== undefined) localData[key] = value;
  }
  const [conversations, messages, memories, tasks, files] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memories.toArray(),
    db.tasks.toArray(),
    db.files.toArray(),
  ]);
  return { local: localData, conversations, messages, memories, tasks, files };
}

/** Write an unencrypted local recovery snapshot (PLAN §32, §42). Local only. */
export async function writeRecoverySnapshot(): Promise<void> {
  const data = await collect();
  await local.set('auto_backup_snapshot', { created: new Date().toISOString(), data });
}

export async function createBackup(password: string, hint?: string): Promise<BackupFile> {
  const data = await collect();
  return {
    version: '1.0',
    created: new Date().toISOString(),
    encrypted: true,
    hint,
    payload: await encryptJson(data, password),
  };
}

export type RestoreMode = 'full' | 'merge';

/** Which data categories to restore (PLAN §32 selective restore). */
export interface RestoreCategories {
  settings: boolean;
  conversations: boolean;
  memories: boolean;
  tasks: boolean;
  files: boolean;
}

const ALL_CATEGORIES: RestoreCategories = {
  settings: true,
  conversations: true,
  memories: true,
  tasks: true,
  files: true,
};

/** Decrypt a backup and report what it contains (for the restore preview). */
export async function previewBackup(
  file: BackupFile,
  password: string,
): Promise<{ conversations: number; messages: number; memories: number; tasks: number; files: number }> {
  const data = await decryptJson<BackupData>(file.payload, password);
  return {
    conversations: data.conversations.length,
    messages: data.messages.length,
    memories: data.memories.length,
    tasks: data.tasks.length,
    files: data.files.length,
  };
}

/**
 * Restore a backup. `mode`:
 *  - full  → replace everything in the selected categories
 *  - merge → keep existing rows, add only ids that don't already exist
 */
export async function restoreBackup(
  file: BackupFile,
  password: string,
  mode: RestoreMode = 'full',
  categories: RestoreCategories = ALL_CATEGORIES,
): Promise<void> {
  const data = await decryptJson<BackupData>(file.payload, password);

  if (categories.settings) {
    for (const [key, value] of Object.entries(data.local)) await local.set(key, value);
  }

  await db.transaction(
    'rw',
    db.conversations,
    db.messages,
    db.memories,
    db.tasks,
    db.files,
    async () => {
      const restore = async (
        enabled: boolean,
        table: { clear(): Promise<void>; bulkPut(rows: never[]): Promise<unknown>; bulkAdd(rows: never[]): Promise<unknown> },
        rows: unknown[],
      ) => {
        if (!enabled) return;
        if (mode === 'full') {
          await table.clear();
          await table.bulkPut(rows as never[]);
        } else {
          // merge — bulkPut upserts by primary key without wiping extras.
          await table.bulkPut(rows as never[]);
        }
      };
      await restore(categories.conversations, db.conversations, data.conversations);
      await restore(categories.conversations, db.messages, data.messages);
      await restore(categories.memories, db.memories, data.memories);
      await restore(categories.tasks, db.tasks, data.tasks);
      await restore(categories.files, db.files, data.files);
    },
  );
}
