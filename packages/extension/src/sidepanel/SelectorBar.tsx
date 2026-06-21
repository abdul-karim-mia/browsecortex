import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import type { Model, Provider } from '@/types';

/**
 * Provider + model selector (PLAN §7). Persists the choice to settings so the
 * agent loop's resolveActive() can pick it up. Models come from the stored
 * list when available, otherwise the user types a model id directly.
 */
export function SelectorBar() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [provs, settings] = await Promise.all([
        Storage.providers.list(),
        Storage.settings.get(),
      ]);
      setProviders(provs);
      if (provs.length === 0) return;

      // Default to the saved selection, else the first provider — and persist
      // it so resolveActive() sees a concrete choice (not just local UI state).
      const pid = settings.selectedProviderId ?? provs[0].id;
      setProviderId(pid);
      const list = await Storage.models.listByProvider(pid);
      setModels(list);

      // Default the model to the saved one, else the first available model.
      const m = settings.selectedModel ?? list[0]?.id ?? '';
      setModel(m);

      // Persist defaults if they weren't already set.
      const patch: Partial<typeof settings> = {};
      if (settings.selectedProviderId !== pid) patch.selectedProviderId = pid;
      if (settings.selectedModel !== m && m) patch.selectedModel = m;
      if (Object.keys(patch).length) await Storage.settings.update(patch);
    })();
  }, []);

  const onProvider = async (pid: string) => {
    setProviderId(pid);
    const list = await Storage.models.listByProvider(pid);
    setModels(list);
    const m = list[0]?.id ?? '';
    setModel(m);
    await Storage.settings.update({ selectedProviderId: pid, selectedModel: m });
  };

  const onModel = async (m: string) => {
    setModel(m);
    await Storage.settings.update({ selectedModel: m });
  };

  // No providers yet — guide the user to Settings instead of hiding the bar.
  if (providers.length === 0) {
    return (
      <button
        type="button"
        onClick={() => chrome.runtime?.openOptionsPage?.()}
        class="border-b border-gray-200 px-3 py-2 text-left text-sm text-blue-600 hover:underline dark:border-gray-700"
      >
        + Add an AI provider in Settings to get started
      </button>
    );
  }

  return (
    <div class="flex gap-2 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
      <select
        value={providerId ?? ''}
        onChange={(e) => onProvider((e.target as HTMLSelectElement).value)}
        class="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 dark:border-gray-600 dark:bg-gray-800"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {models.length > 0 ? (
        <select
          value={model}
          onChange={(e) => onModel((e.target as HTMLSelectElement).value)}
          class="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 dark:border-gray-600 dark:bg-gray-800"
        >
          <option value="">Model…</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={model}
          onInput={(e) => onModel((e.target as HTMLInputElement).value)}
          onBlur={() => model && onModel(model)}
          placeholder="model id"
          class="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
      )}
    </div>
  );
}
