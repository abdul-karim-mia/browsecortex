/**
 * Backup tool (PLAN §32). Lets the AI export an encrypted backup to the user's
 * Downloads folder on request. The password is supplied in the call.
 */
import type { ToolDefinition } from '../types';
import { createBackup } from '@/backup/backup';

export const createBackupTool: ToolDefinition = {
  name: 'create_backup',
  description:
    'Export an encrypted backup of all BrowseCortex data (.browsecortex file) to Downloads. ' +
    'Requires a password (min 8 chars) the user provides — they must remember it to restore.',
  parameters: {
    type: 'object',
    properties: {
      password: { type: 'string', description: 'Encryption password (min 8 chars).' },
      hint: { type: 'string', description: 'Optional password hint stored in the file.' },
    },
    required: ['password'],
  },
  destructive: true,
  timeout: 'file',
  async execute(args) {
    const password = String(args.password ?? '');
    if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
    try {
      const backup = await createBackup(password, args.hint ? String(args.hint) : undefined);
      const json = JSON.stringify(backup);
      const dataUrl = `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
      const filename = `browsecortex-${new Date().toISOString().slice(0, 10)}.browsecortex`;
      const id = await chrome.downloads.download({ url: dataUrl, filename });
      return { exported: filename, downloadId: id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const backupTools = [createBackupTool];
