import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { syncProviderModels } from '@/models/enrich';
import { pingCapabilities } from '@/models/ping';
import type { Model, Provider } from '@/types';

/** Models settings tab (PLAN §6): per-provider list, enable toggles, capabilities. */
export function ModelsTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);

  useEffect(() => {
    Storage.providers.list().then((provs) => {
      setProviders(provs);
      if (provs[0]) selectProvider(provs[0].id);
    });
  }, []);

  const selectProvider = async (pid: string) => {
    setProviderId(pid);
    setModels(await Storage.models.listByProvider(pid));
  };

  const refreshFromApi = async () => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    setStatus('Syncing…');
    try {
      const synced = await syncProviderModels(provider);
      setModels(synced);
      setStatus(`Synced ${synced.length} models.`);
    } catch (e) {
      setStatus(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const persist = async (next: Model[]) => {
    setModels(next);
    if (providerId) await Storage.models.setForProvider(providerId, next);
  };

  const toggle = (id: string) =>
    persist(models.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));

  // Manual capability override (PLAN §6) — flips a flag and marks source 'user'.
  const override = (id: string, key: 'hasVision' | 'hasToolCalling' | 'hasReasoning' | 'hasToolChoice') =>
    persist(
      models.map((m) => (m.id === id ? { ...m, [key]: !m[key], capabilitySource: 'user' } : m)),
    );

  const testCapabilities = async (model: Model) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    setStatus(`Testing ${model.id}…`);
    setTestingModelId(model.id);
    try {
      const r = await pingCapabilities(provider, model.id);
      await persist(
        models.map((m) =>
          m.id === model.id
            ? {
                ...m,
                hasVision: r.hasVision,
                hasToolCalling: r.hasToolCalling,
                hasToolChoice: r.hasToolChoice,
                hasReasoning: r.hasReasoning,
                capabilitySource: 'ping',
              }
            : m,
        ),
      );
      setStatus(
        `${model.id}: vision ${r.hasVision ? '✓' : '✗'}, tools ${r.hasToolCalling ? '✓' : '✗'}, tool choice ${r.hasToolChoice ? '✓' : '✗'}, reasoning ${r.hasReasoning ? '✓' : '✗'}, streaming ${r.streaming ? '✓' : '✗'}`,
      );
    } catch (e) {
      setStatus(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingModelId(null);
    }
  };

  const cap = (m: Model) =>
    [
      m.hasToolCalling ? 'tools' : null,
      m.hasToolChoice ? 'tool choice' : null,
      m.hasVision ? 'vision' : null,
      m.hasReasoning ? 'reasoning' : null,
      m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  if (providers.length === 0) {
    return <p class="text-sm text-gray-400">Add a provider first.</p>;
  }

  return (
    <div class="space-y-6 text-sm">
      <div class="flex items-center gap-2">
        <select
          value={providerId ?? ''}
          onChange={(e) => selectProvider((e.target as HTMLSelectElement).value)}
          class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refreshFromApi}
          class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white"
        >
          Refresh from API
        </button>
      </div>

      {status && (
        <div class="rounded border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800/50">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Status / Test Results
          </div>
          <div class="mt-1 font-mono text-xs text-gray-600 dark:text-gray-300">
            {status}
          </div>
        </div>
      )}

      {models.length === 0 ? (
        <p class="text-sm text-gray-400">No models yet — click "Refresh from API".</p>
      ) : (
        <ul class="divide-y divide-gray-200 dark:divide-gray-700">
          {models.map((m) => (
            <li key={m.id} class="py-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{m.id}</div>
                  <div class="text-xs text-gray-400">
                    {cap(m) || 'capabilities unknown'} · src: {m.capabilitySource}
                  </div>
                </div>
                <label class="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={m.enabled} onChange={() => toggle(m.id)} />
                  enabled
                </label>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {(['hasToolCalling', 'hasToolChoice', 'hasVision', 'hasReasoning'] as const).map((k) => (
                  <label key={k} class="flex items-center gap-1">
                    <input type="checkbox" checked={!!m[k]} onChange={() => override(m.id, k)} />
                    {k === 'hasToolCalling' ? 'tools' : k === 'hasToolChoice' ? 'tool choice' : k === 'hasVision' ? 'vision' : 'reasoning'}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={testingModelId !== null}
                  onClick={() => testCapabilities(m)}
                  class={`text-blue-500 hover:underline ${testingModelId !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {testingModelId === m.id ? 'Testing…' : 'Test capabilities'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
