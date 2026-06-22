import { useEffect, useState } from 'preact/hooks';
import {
  fetchIndex,
  install,
  listInstalled,
  saveInstalled,
  uninstall,
} from '@/skills/store';
import type { InstalledSkill, SkillIndexEntry } from '@/skills/types';

/** Skills marketplace + local editor (PLAN §19). */
export function SkillsTab() {
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [available, setAvailable] = useState<SkillIndexEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [editor, setEditor] = useState({ name: '', content: '' });

  const refresh = () => listInstalled().then(setInstalled);
  useEffect(() => {
    refresh();
    fetchIndex().then(setAvailable).catch(() => {});
  }, []);

  const installedIds = new Set(installed.map((s) => s.id));

  const doInstall = async (entry: SkillIndexEntry) => {
    setStatus(`Installing ${entry.name}…`);
    try {
      await install(entry);
      await refresh();
      setStatus(`Installed ${entry.name}.`);
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (id: string) => {
    await uninstall(id);
    await refresh();
  };

  const saveCustom = async () => {
    if (!editor.name.trim() || !editor.content.trim()) return;
    const id = `custom-${editor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await saveInstalled({
      id,
      name: editor.name,
      path: '',
      category: 'custom',
      author: 'you',
      version: '1.0',
      content: editor.content,
      installedAt: new Date().toISOString(),
      custom: true,
    });
    setEditor({ name: '', content: '' });
    await refresh();
    setStatus(`Saved custom skill ${editor.name}.`);
  };

  return (
    <div class="space-y-6 text-sm">
      {status && <div class="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">{status}</div>}
      <section>
        <h2 class="mb-2 text-sm font-semibold">Installed skills</h2>
        {installed.length === 0 ? (
          <p class="text-sm text-gray-400">No skills installed.</p>
        ) : (
          <ul class="space-y-1">
            {installed.map((s) => (
              <li
                key={s.id}
                class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <span>
                  {s.icon ?? '🧩'} {s.name}
                  <span class="ml-2 text-xs text-gray-400">
                    {s.category}
                    {s.custom ? ' · custom' : ` · v${s.version}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  class="text-xs text-red-500 hover:underline"
                >
                  Uninstall
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">Marketplace</h2>
        {available.length > 0 && (
          <ul class="space-y-1">
            {available.map((s) => (
              <li
                key={s.id}
                class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <span>
                  {s.icon ?? '🧩'} {s.name}
                  <span class="ml-2 text-xs text-gray-400">{s.description ?? s.category}</span>
                </span>
                {installedIds.has(s.id) ? (
                  <span class="text-xs text-gray-400">Installed</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => doInstall(s)}
                    class="text-xs text-blue-500 hover:underline"
                  >
                    Install
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Create a custom skill</h2>
        <input
          value={editor.name}
          onInput={(e) => setEditor({ ...editor, name: (e.target as HTMLInputElement).value })}
          placeholder="Skill name"
          class="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
        <textarea
          rows={6}
          value={editor.content}
          onInput={(e) => setEditor({ ...editor, content: (e.target as HTMLTextAreaElement).value })}
          placeholder={'# My Skill\n\n## Instructions\n1. ...'}
          class="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-gray-800"
        />
        <button type="button" onClick={saveCustom} class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white">
          Save skill
        </button>
      </section>
    </div>
  );
}
