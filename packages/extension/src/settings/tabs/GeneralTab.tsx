import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import {
  DEFAULT_SETTINGS,
  type Model,
  type Provider,
  type ReasoningEffort,
  type Settings,
} from '@/types';

/** General settings (PLAN §10, §17, §34, §35, §45). */
export function GeneralTab() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    Storage.settings.get().then(setSettings);
    Storage.providers.list().then(setProviders);
  }, []);

  // Subagent model options come from the active provider (subagents reuse it).
  useEffect(() => {
    if (!settings.selectedProviderId) return setModels([]);
    Storage.models.listByProvider(settings.selectedProviderId).then(setModels);
  }, [settings.selectedProviderId]);

  const update = async (patch: Partial<Settings>) => {
    const next = await Storage.settings.update(patch);
    setSettings(next);
  };

  return (
    <div class="space-y-6 text-sm">
      <Field label="Reasoning effort">
        <select
          value={settings.reasoningEffort}
          onChange={(e) =>
            update({ reasoningEffort: (e.target as HTMLSelectElement).value as ReasoningEffort })
          }
          class={selectCls}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </Field>

      <Field label="Subagent model">
        <select
          value={settings.subagentModel}
          onChange={(e) => update({ subagentModel: (e.target as HTMLSelectElement).value })}
          class={selectCls}
        >
          <option value="">Same as main model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
        <p class="mt-1 text-xs text-gray-500">
          Model used by delegated subagents (spawn_agent). Uses the active provider.
        </p>
      </Field>

      <Field label={`Max tool-call loops per message (${settings.maxToolCallLoops})`}>
        <input
          type="range"
          min={5}
          max={500}
          value={settings.maxToolCallLoops}
          onInput={(e) =>
            update({ maxToolCallLoops: Number((e.target as HTMLInputElement).value) })
          }
          class="w-full"
        />
      </Field>

      <Field label="Context compaction">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.compactionEnabled}
            onChange={(e) => update({ compactionEnabled: (e.target as HTMLInputElement).checked })}
          />
          Enable auto-compaction
        </label>
        <select
          value={String(settings.compactionThreshold)}
          onChange={(e) =>
            update({
              compactionThreshold: Number((e.target as HTMLSelectElement).value) as 0.5 | 0.7 | 0.8,
            })
          }
          class={selectCls}
        >
          <option value="0.5">Threshold 50%</option>
          <option value="0.7">Threshold 70%</option>
          <option value="0.8">Threshold 80%</option>
        </select>
      </Field>

      <Field label="Tool timeout multiplier">
        <select
          value={String(settings.toolTimeoutMultiplier)}
          onChange={(e) =>
            update({
              toolTimeoutMultiplier: Number((e.target as HTMLSelectElement).value) as
                | 0.5
                | 1
                | 2
                | 3,
            })
          }
          class={selectCls}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="3">3×</option>
        </select>
      </Field>

      <Field label="Density">
        <select
          value={settings.density}
          onChange={(e) =>
            update({ density: (e.target as HTMLSelectElement).value as Settings['density'] })
          }
          class={selectCls}
        >
          <option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </Field>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.runJavascriptEnabled}
          onChange={(e) => update({ runJavascriptEnabled: (e.target as HTMLInputElement).checked })}
        />
        Enable run_javascript tool (advanced)
      </label>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.showReasoningTokens}
          onChange={(e) => update({ showReasoningTokens: (e.target as HTMLInputElement).checked })}
        />
        Show reasoning tokens
      </label>

      <Field label="Vision fallback">
        <select
          value={settings.visionFallbackMode}
          onChange={(e) =>
            update({
              visionFallbackMode: (e.target as HTMLSelectElement)
                .value as Settings['visionFallbackMode'],
            })
          }
          class={selectCls}
        >
          <option value="disabled">Disabled — skip vision tasks</option>
          <option value="provider">Use a configured provider/model</option>
        </select>
        {settings.visionFallbackMode === 'provider' && (
          <div class="mt-2 space-y-2">
            <select
              value={settings.visionFallbackProviderId ?? ''}
              onChange={(e) =>
                update({ visionFallbackProviderId: (e.target as HTMLSelectElement).value || null })
              }
              class={selectCls}
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={settings.visionFallbackModel ?? ''}
              onInput={(e) =>
                update({ visionFallbackModel: (e.target as HTMLInputElement).value || null })
              }
              placeholder="vision model id (e.g. gpt-4o)"
              class={selectCls}
            />
          </div>
        )}
      </Field>

      <Field label="Notifications">
        <div class="space-y-1">
          {(
            [
              ['taskCompleted', 'Task completed'],
              ['taskFailed', 'Task failed'],
              ['needsInput', 'Needs your input'],
              ['rateLimit', 'Rate limit warnings'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.notifications[key]}
                onChange={(e) =>
                  update({
                    notifications: {
                      ...settings.notifications,
                      [key]: (e.target as HTMLInputElement).checked,
                    },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="System prompt additions">
        <textarea
          rows={3}
          value={settings.systemPromptAdditions}
          onInput={(e) =>
            update({ systemPromptAdditions: (e.target as HTMLTextAreaElement).value })
          }
          class="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
        />
      </Field>
    </div>
  );
}

const selectCls =
  'mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800';

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div>
      <div class="mb-1 font-medium text-gray-600 dark:text-gray-300">{label}</div>
      {children}
    </div>
  );
}
