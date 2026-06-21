/**
 * Update & migration safety (PLAN §42). On the first run after the extension
 * version changes, write a recovery snapshot before the user does more work, so
 * a bad migration can't silently lose everything. Dexie's own upgrades are
 * transactional (they roll back on failure); this is the extra safety net.
 */
import * as local from '@/storage/local';
import { writeRecoverySnapshot } from '@/backup/backup';

const VERSION_KEY = 'last_extension_version';

export async function runMigrationSafety(): Promise<void> {
  const current = chrome.runtime.getManifest().version;
  const last = await local.get<string>(VERSION_KEY);
  if (last === current) return;

  // Version changed (install or update) — snapshot current data, best-effort.
  try {
    await writeRecoverySnapshot();
  } catch {
    /* non-fatal */
  }
  await local.set(VERSION_KEY, current);
}
