/**
 * Per-category storage breakdown (PLAN §41). Split from `storage/quota.ts`
 * because it needs Dexie — keeping it separate lets the dependency-free quota
 * helpers stay out of lightweight bundles (e.g. onboarding).
 */
import { db } from '@/db';
import * as local from '@/storage/local';

export interface StorageBreakdown {
  conversationsMB: number;
  filesMB: number;
  memoriesTasksMB: number;
  skillsMB: number;
}

const BYTES_PER_MB = 1024 * 1024;

/** Approximate serialized size of a set of rows, in MB. */
function approxMB(rows: unknown[]): number {
  let bytes = 0;
  for (const row of rows) bytes += JSON.stringify(row).length;
  return bytes / BYTES_PER_MB;
}

/**
 * Sizes are approximate — derived from serialized row length, not exact on-disk
 * bytes — but good enough to show the user where their space is going. VFS files
 * use their tracked `size`.
 */
export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const [conversations, messages, memories, tasks, files] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memories.toArray(),
    db.tasks.toArray(),
    db.files.toArray(),
  ]);
  const installedSkills = (await local.get<unknown[]>('installed_skills')) ?? [];
  const filesBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  return {
    conversationsMB: approxMB(conversations) + approxMB(messages),
    filesMB: filesBytes / BYTES_PER_MB,
    memoriesTasksMB: approxMB(memories) + approxMB(tasks),
    skillsMB: approxMB(installedSkills),
  };
}
