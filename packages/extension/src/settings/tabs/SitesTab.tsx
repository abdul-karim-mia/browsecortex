import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { Icon } from '@/components/Icon';
import type { SiteToolRule } from '@/types';

/**
 * Per-site tool restrictions (B5). Each rule maps an origin pattern (with `*`
 * wildcards) to a list of tool names that are blocked while the active tab
 * matches it. Enforced in the agent loop before a tool runs.
 */
export function SitesTab() {
  const [rules, setRules] = useState<SiteToolRule[]>([]);

  useEffect(() => {
    Storage.settings.get().then((s) => setRules(s.siteToolRules ?? []));
  }, []);

  const persist = async (next: SiteToolRule[]) => {
    setRules(next);
    await Storage.settings.update({ siteToolRules: next });
  };

  const update = (i: number, patch: Partial<SiteToolRule>) =>
    persist(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const add = () => persist([...rules, { pattern: '', blockedTools: [] }]);
  const remove = (i: number) => persist(rules.filter((_, j) => j !== i));

  return (
    <div class="space-y-4 text-sm">
      <p class="text-gray-600 dark:text-gray-300">
        Block specific tools while the active tab matches an origin pattern. Patterns support{' '}
        <code>*</code> wildcards and are matched against the page URL, origin, and hostname — e.g.{' '}
        <code>*.bank.com</code> or <code>https://example.com/*</code>.
      </p>

      {rules.length === 0 && <p class="text-gray-400">No rules. Add one to restrict tools per site.</p>}

      <div class="space-y-3">
        {rules.map((rule, i) => (
          <div
            key={i}
            class="rounded border border-gray-200 p-3 dark:border-gray-700"
          >
            <div class="mb-2 flex items-center gap-2">
              <input
                value={rule.pattern}
                onInput={(e) => update(i, { pattern: (e.target as HTMLInputElement).value })}
                placeholder="*.example.com"
                class="flex-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                class="text-red-500"
                title="Remove rule"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
            <label class="mb-1 block text-xs text-gray-500">Blocked tools (comma-separated)</label>
            <input
              value={rule.blockedTools.join(', ')}
              onInput={(e) =>
                update(i, {
                  blockedTools: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="click_element, fill_input, run_javascript"
              class="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        class="flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
      >
        <Icon name="plus" size={14} /> Add rule
      </button>
    </div>
  );
}
