import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { testConnection } from '@/providers/client';
import { searchSuggestions } from '@/providers/suggestions';
import { syncProviderModels } from '@/models/enrich';
import { ProviderRow } from './ProviderRow';
import { Icon } from '@/components/Icon';
import type { Provider } from '@/types';

function uuid(): string {
  return crypto.randomUUID();
}

const empty = (): Provider => ({
  id: uuid(),
  name: '',
  baseUrl: '',
  apiKey: '',
  createdAt: new Date().toISOString(),
});

export function ProvidersTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [draft, setDraft] = useState<Provider>(empty());
  const [showKey, setShowKey] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => Storage.providers.list().then(setProviders);
  useEffect(() => {
    refresh();
  }, []);

  const suggestions = searchSuggestions(draft.baseUrl);

  const save = async () => {
    if (!draft.name || !draft.baseUrl) {
      setStatus('Name and Base URL are required.');
      return;
    }
    setStatus('Testing connection…');
    const result = await testConnection(draft);
    if (!result.ok) {
      setStatus(`Connection failed: ${result.error}`);
      return;
    }
    await Storage.providers.save(draft);
    setStatus(`Saved — ${result.modelCount} models found. Syncing capabilities…`);
    try {
      const models = await syncProviderModels(draft);
      setStatus(`Saved — ${models.length} models synced. See the Models tab.`);
    } catch {
      setStatus(`Saved — ${result.modelCount} models found (capability sync failed).`);
    }
    setDraft(empty());
    setShowKey(false);
    await refresh();
  };

  return (
    <div class="space-y-6 text-sm">
      {/* Existing providers */}
      <section>
        <h2 class="mb-2 text-sm font-semibold">Your providers</h2>
        {providers.length === 0 ? (
          <p class="text-sm text-gray-400">No providers yet. Add one below.</p>
        ) : (
          <ul class="space-y-2">
            {providers.map((p) => (
              <ProviderRow key={p.id} provider={p} allProviders={providers} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>

      {/* Add / edit */}
      <section class="space-y-3 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Add a provider</h2>

        <label class="block">
          <span class="text-xs text-gray-500">Name</span>
          <input
            value={draft.name}
            onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })}
            placeholder="My Groq"
            class="mt-1 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>

        <label class="relative block">
          <span class="text-xs text-gray-500">Base URL</span>
          <input
            value={draft.baseUrl}
            onFocus={() => setShowSuggest(true)}
            onInput={(e) => {
              setDraft({ ...draft, baseUrl: (e.target as HTMLInputElement).value });
              setShowSuggest(true);
            }}
            onBlur={() => setShowSuggest(false)}
            placeholder="https://api.groq.com/openai/v1"
            class="mt-1 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
          {showSuggest && suggestions.length > 0 && (
            <ul class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow dark:border-gray-600 dark:bg-gray-800">
              {suggestions.map((s) => (
                <li key={s.baseUrl}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraft({
                        ...draft,
                        name: draft.name || s.name,
                        baseUrl: s.baseUrl,
                      });
                      setShowSuggest(false);
                    }}
                    class="flex w-full items-center justify-between px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span>{s.name}</span>
                    <span class="text-xs text-gray-400">{s.baseUrl}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>

        <label class="block">
          <span class="text-xs text-gray-500">API Key</span>
          <div class="mt-1 flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              onInput={(e) => setDraft({ ...draft, apiKey: (e.target as HTMLInputElement).value })}
              placeholder="sk-..."
              class="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              class="flex items-center rounded border border-gray-300 px-2 dark:border-gray-600"
              title={showKey ? 'Hide' : 'Show'}
            >
              <Icon name={showKey ? 'eye-off' : 'eye'} size={15} />
            </button>
          </div>
        </label>

        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white"
          >
            Test &amp; Save
          </button>
          {status && <span class="text-sm text-gray-500">{status}</span>}
        </div>
      </section>
    </div>
  );
}
