import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { clearCooldown, getCooldown } from '@/providers/cooldown';
import type { Cooldown } from '@/providers/cooldown';
import type { Provider } from '@/types';

interface Props {
  provider: Provider;
  allProviders: Provider[];
  onChanged: () => void;
}

/** One provider row with fallback selection and cooldown status (PLAN §40). */
export function ProviderRow({ provider, allProviders, onChanged }: Props) {
  const [cooldown, setCooldown] = useState<Cooldown | null>(null);

  const refreshCooldown = () => getCooldown(provider.id).then(setCooldown);
  useEffect(() => {
    refreshCooldown();
    const interval = setInterval(refreshCooldown, 1000);
    return () => clearInterval(interval);
  }, [provider.id]);

  const remaining = cooldown ? Math.max(0, Math.ceil((cooldown.until - Date.now()) / 1000)) : 0;
  const cooling = remaining > 0;

  const setFallback = async (fallbackProviderId: string) => {
    await Storage.providers.save({
      ...provider,
      fallbackProviderId: fallbackProviderId || undefined,
    });
    onChanged();
  };

  const clear = async () => {
    await clearCooldown(provider.id);
    await refreshCooldown();
  };

  const others = allProviders.filter((p) => p.id !== provider.id);

  return (
    <li class="rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium">
            {provider.name}
            {cooling && (
              <span class="ml-2 text-xs text-amber-600">
                ⏱ {cooldown?.state === 'degraded' ? 'degraded' : 'rate limited'} {remaining}s
              </span>
            )}
          </div>
          <div class="text-xs text-gray-400">{provider.baseUrl}</div>
          {provider.apiKey && (
            <div
              class="group/key mt-0.5 font-mono text-xs text-gray-400"
              title="Hover to reveal last 4"
            >
              <span class="group-hover/key:hidden">●●●●●●●●</span>
              <span class="hidden group-hover/key:inline">●●●●{provider.apiKey.slice(-4)}</span>
            </div>
          )}
        </div>
        <div class="flex items-center gap-2 text-xs">
          {cooling && (
            <button type="button" onClick={clear} class="text-amber-600 hover:underline">
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => Storage.providers.remove(provider.id).then(onChanged)}
            class="text-red-500 hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      {others.length > 0 && (
        <label class="mt-2 flex items-center gap-2 text-xs text-gray-500">
          Fallback when rate limited:
          <select
            value={provider.fallbackProviderId ?? ''}
            onChange={(e) => setFallback((e.target as HTMLSelectElement).value)}
            class="rounded border border-gray-300 px-1 py-0.5 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="">None</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}
