import { useEffect, useState } from 'preact/hooks';
import {
  createBackup,
  previewBackup,
  restoreBackup,
  type BackupFile,
  type RestoreCategories,
  type RestoreMode,
} from '@/backup/backup';
import { Storage } from '@/storage';

/** Backup & Restore (PLAN §32). Export/import an encrypted .browsecortex file,
 * with full/merge + selective restore and auto-backup scheduling. */
export function BackupTab() {
  const [exportPwd, setExportPwd] = useState('');
  const [hint, setHint] = useState('');
  const [importPwd, setImportPwd] = useState('');
  const [importFile, setImportFile] = useState<BackupFile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>('full');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [categories, setCategories] = useState<RestoreCategories>({
    settings: true,
    conversations: true,
    memories: true,
    tasks: true,
    files: true,
  });
  const [autoDays, setAutoDays] = useState(0);

  useEffect(() => {
    Storage.settings.get().then((s) => setAutoDays(s.autoBackupDays ?? 0));
  }, []);

  const doExport = async () => {
    if (exportPwd.length < 8) {
      setStatus('Password must be at least 8 characters.');
      return;
    }
    setStatus('Encrypting…');
    const backup = await createBackup(exportPwd, hint || undefined);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browsecortex-${new Date().toISOString().slice(0, 10)}.browsecortex`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup downloaded.');
    setExportPwd('');
  };

  const onFile = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      setImportFile(parsed);
      setPreview(null);
      setStatus(parsed.hint ? `Loaded backup (hint: ${parsed.hint}).` : 'Backup loaded.');
    } catch {
      setStatus('Not a valid backup file.');
    }
  };

  const doPreview = async () => {
    if (!importFile) return;
    try {
      setPreview(await previewBackup(importFile, importPwd));
      setStatus('Decrypted. Review the contents below, then restore.');
    } catch {
      setStatus('Wrong password or corrupt file.');
    }
  };

  const doImport = async () => {
    if (!importFile) return;
    setStatus('Restoring…');
    try {
      await restoreBackup(importFile, importPwd, mode, categories);
      setStatus('Restore complete. Reload the extension.');
    } catch {
      setStatus('Restore failed — wrong password or corrupt file.');
    }
  };

  const toggleCat = (k: keyof RestoreCategories) =>
    setCategories((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div class="space-y-6 text-sm">
      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Export</h2>
        <input
          type="password"
          value={exportPwd}
          onInput={(e) => setExportPwd((e.target as HTMLInputElement).value)}
          placeholder="Password (min 8 chars)"
          class={inputCls}
        />
        <input
          value={hint}
          onInput={(e) => setHint((e.target as HTMLInputElement).value)}
          placeholder="Optional password hint"
          class={inputCls}
        />
        <button type="button" onClick={doExport} class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white">
          Export encrypted backup
        </button>
      </section>

      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Import</h2>
        <input type="file" accept=".browsecortex,application/json" onChange={onFile} />
        <input
          type="password"
          value={importPwd}
          onInput={(e) => setImportPwd((e.target as HTMLInputElement).value)}
          placeholder="Password"
          class={inputCls}
        />
        <button
          type="button"
          onClick={doPreview}
          disabled={!importFile}
          class="rounded border border-gray-300 px-4 py-1.5 disabled:opacity-50 dark:border-gray-600"
        >
          Decrypt &amp; preview
        </button>

        {preview && (
          <div class="rounded bg-gray-50 p-2 text-xs dark:bg-gray-800">
            Contains: {preview.conversations} conversations, {preview.messages} messages,{' '}
            {preview.memories} memories, {preview.tasks} tasks, {preview.files} files.
          </div>
        )}

        <div class="text-xs">
          <span class="text-gray-500">Mode:</span>
          {(['full', 'merge'] as const).map((m) => (
            <label key={m} class="ml-2">
              <input type="radio" checked={mode === m} onChange={() => setMode(m)} />{' '}
              {m === 'full' ? 'Full (replace)' : 'Merge (keep existing)'}
            </label>
          ))}
        </div>
        <div class="flex flex-wrap gap-3 text-xs">
          {(Object.keys(categories) as (keyof RestoreCategories)[]).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={categories[k]} onChange={() => toggleCat(k)} /> {k}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={doImport}
          disabled={!importFile}
          class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white disabled:opacity-50"
        >
          Restore
        </button>
      </section>

      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Auto-backup</h2>
        <label class="flex items-center gap-2 text-xs">
          Keep a local recovery snapshot every
          <select
            value={String(autoDays)}
            onChange={async (e) => {
              const days = Number((e.target as HTMLSelectElement).value);
              setAutoDays(days);
              await Storage.settings.update({ autoBackupDays: days });
            }}
            class="rounded border border-gray-300 px-1 py-0.5 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="0">Never</option>
            <option value="1">day</option>
            <option value="7">week</option>
            <option value="30">month</option>
          </select>
        </label>
        <p class="text-xs text-gray-500">
          Stored locally and unencrypted for crash recovery — your API keys stay on this device and
          are never downloaded. Use Export above for a portable, encrypted copy.
        </p>
      </section>

      {status && <p class="text-sm text-gray-500">{status}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800';
