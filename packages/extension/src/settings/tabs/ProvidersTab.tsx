import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { testConnection } from '@/providers/client';
import {
  searchSuggestions,
  PROVIDER_SUGGESTIONS,
  type ProviderSuggestion,
} from '@/providers/suggestions';
import { syncProviderModels } from '@/models/enrich';
import { isCoolingDown } from '@/providers/cooldown';
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

/** A curated shortlist surfaced as one-tap chips in the Add-a-provider guide.
 * Only providers with a real OpenAI-compatible base URL are included. */
const POPULAR_PROVIDER_NAMES = [
  'OpenAI',
  'Google AI / Gemini',
  'OpenRouter',
  'Groq',
  'DeepSeek',
  'Mistral AI',
  'xAI',
  'Ollama',
];

const POPULAR_PROVIDERS = POPULAR_PROVIDER_NAMES.map((n) =>
  PROVIDER_SUGGESTIONS.find((s) => s.name === n),
).filter((s): s is ProviderSuggestion => Boolean(s));

export function ProvidersTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [draft, setDraft] = useState<Provider>(empty());
  const [showKey, setShowKey] = useState(false);
  const [showSuggestName, setShowSuggestName] = useState(false);
  const [showSuggestBaseUrl, setShowSuggestBaseUrl] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ProviderSuggestion | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [coolingIds, setCoolingIds] = useState<Set<string>>(new Set());

  const refresh = () => Storage.providers.list().then(setProviders);
  useEffect(() => {
    refresh();
  }, []);

  // Poll cooldown state for every provider so tabs can show an amber dot when a
  // provider is rate-limited / cooling down (mirrors the per-row indicator).
  useEffect(() => {
    if (providers.length === 0) {
      setCoolingIds(new Set());
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const flags = await Promise.all(providers.map((p) => isCoolingDown(p.id)));
      if (cancelled) return;
      setCoolingIds(new Set(providers.filter((_, i) => flags[i]).map((p) => p.id)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [providers]);

  const nameSuggestions = searchSuggestions(draft.name);
  const urlSuggestions = searchSuggestions(draft.baseUrl);

  // Find a suggestion that matches the current draft.baseUrl or draft.name
  const activeSuggestion =
    selectedSuggestion ||
    PROVIDER_SUGGESTIONS.find(
      (s) =>
        s.baseUrl === draft.baseUrl ||
        (draft.name && s.name.toLowerCase() === draft.name.toLowerCase()),
    );

  const keyUrl = activeSuggestion?.affiliateUrl || activeSuggestion?.apiKeyUrl;

  // The provider whose detail panel is shown; falls back to the first one so a
  // deleted/never-clicked tab still resolves to something valid.
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0];

  const isErrorStatus = Boolean(
    status && (status.startsWith('Connection failed') || status.includes('required')),
  );

  const applySuggestion = (s: ProviderSuggestion) => {
    setDraft((d) => ({ ...d, name: s.name, baseUrl: s.baseUrl }));
    setSelectedSuggestion(s);
    setShowSuggestName(false);
    setShowSuggestBaseUrl(false);
    setStatus(null);
  };

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
    setSelectedSuggestion(null);
    await refresh();
  };

  return (
    <div class="space-y-6 text-sm">
      {/* Existing providers — shown as tabs, one detail panel at a time */}
      <section>
        <h2 class="mb-2 text-sm font-semibold">Your providers</h2>
        {providers.length === 0 ? (
          <p class="text-sm text-gray-400">No providers yet. Add one below.</p>
        ) : (
          <div>
            <div role="tablist" class="flex flex-wrap gap-1.5">
              {providers.map((p) => {
                const isActive = activeProvider?.id === p.id;
                const cooling = coolingIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActiveProviderId(p.id)}
                    class={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800/60 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800'
                    }`}
                  >
                    {cooling && (
                      <span
                        class="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        title="Rate limited / cooling down"
                      />
                    )}
                    <span class="truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
            {activeProvider && (
              <div role="tabpanel" class="mt-3">
                <ProviderRow
                  key={activeProvider.id}
                  provider={activeProvider}
                  allProviders={providers}
                  onChanged={refresh}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Add / edit */}
      <section class="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-700">
        <div>
          <h2 class="text-sm font-semibold">Add a provider</h2>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Connect any OpenAI-compatible API in three steps.
          </p>
        </div>

        {/* Step-by-step guide */}
        <ol class="space-y-2.5 rounded-xl bg-blue-50/70 p-3.5 dark:bg-blue-500/5">
          {[
            {
              title: 'Pick a provider',
              body: 'Tap a popular provider below, or type a name to autofill the Base URL.',
            },
            {
              title: 'Paste your API key',
              body: 'Use the “Get API key” link to open the provider’s dashboard and copy a key.',
            },
            {
              title: 'Test & Save',
              body: 'We verify the connection and sync the available models into the Models tab.',
            },
          ].map((step, i) => (
            <li key={step.title} class="flex gap-2.5">
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div class="text-xs leading-relaxed">
                <span class="font-semibold text-gray-800 dark:text-gray-100">{step.title}</span>
                <span class="text-gray-500 dark:text-gray-400"> — {step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        {/* Popular quick picks */}
        <div>
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Popular providers</span>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            {POPULAR_PROVIDERS.map((s) => {
              const isActive = activeSuggestion?.name === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  class={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        <label class="relative block">
          <span class="text-xs text-gray-500">Name</span>
          <input
            value={draft.name}
            onFocus={() => setShowSuggestName(true)}
            onInput={(e) => {
              setDraft({ ...draft, name: (e.target as HTMLInputElement).value });
              setSelectedSuggestion(null);
              setShowSuggestName(true);
            }}
            onBlur={() => setShowSuggestName(false)}
            placeholder="My Groq"
            class="mt-1 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
          {showSuggestName && nameSuggestions.length > 0 && (
            <ul class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow dark:border-gray-600 dark:bg-gray-800">
              {nameSuggestions.map((s) => (
                <li key={s.baseUrl}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraft({
                        ...draft,
                        name: s.name,
                        baseUrl: s.baseUrl,
                      });
                      setSelectedSuggestion(s);
                      setShowSuggestName(false);
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

        <label class="relative block">
          <span class="text-xs text-gray-500">Base URL</span>
          <input
            value={draft.baseUrl}
            onFocus={() => setShowSuggestBaseUrl(true)}
            onInput={(e) => {
              setDraft({ ...draft, baseUrl: (e.target as HTMLInputElement).value });
              setSelectedSuggestion(null);
              setShowSuggestBaseUrl(true);
            }}
            onBlur={() => setShowSuggestBaseUrl(false)}
            placeholder="https://api.groq.com/openai/v1"
            class="mt-1 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
          <p class="mt-1 text-xs text-gray-400">
            The OpenAI-compatible endpoint, usually ending in <code>/v1</code>.
          </p>
          {showSuggestBaseUrl && urlSuggestions.length > 0 && (
            <ul class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow dark:border-gray-600 dark:bg-gray-800">
              {urlSuggestions.map((s) => (
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
                      setSelectedSuggestion(s);
                      setShowSuggestBaseUrl(false);
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
          <div class="flex justify-between items-center">
            <span class="text-xs text-gray-500">API Key</span>
            {keyUrl && (
              <a
                href={keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-blue-500 hover:underline"
              >
                Get API Key
              </a>
            )}
          </div>
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
          {activeSuggestion && activeSuggestion.apiKeyUrl === null && (
            <p class="mt-1 text-xs text-gray-400">
              Local provider — an API key is usually not required.
            </p>
          )}
        </label>

        <div class="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={save}
            class="rounded-full bg-blue-600 px-5 py-1.5 font-medium text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700"
          >
            Test &amp; Save
          </button>
          {status && (
            <span
              class={`text-sm ${
                isErrorStatus
                  ? 'text-red-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
