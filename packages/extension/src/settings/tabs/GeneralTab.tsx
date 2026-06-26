import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import {
  getStorageEstimate,
  requestPersistentStorage,
  type StorageEstimate,
} from '@/storage/quota';
import { getStorageBreakdown, type StorageBreakdown } from '@/storage/breakdown';
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
  const [visionModels, setVisionModels] = useState<Model[]>([]);
  const [assistModels, setAssistModels] = useState<Model[]>([]);

  useEffect(() => {
    Storage.settings.get().then(setSettings);
    Storage.providers.list().then(setProviders);
  }, []);

  // Subagent model options come from the active provider (subagents reuse it).
  useEffect(() => {
    if (!settings.selectedProviderId) return setModels([]);
    Storage.models.listByProvider(settings.selectedProviderId).then(setModels);
  }, [settings.selectedProviderId]);

  // Vision fallback model options come from the selected vision fallback provider.
  useEffect(() => {
    if (!settings.visionFallbackProviderId) return setVisionModels([]);
    Storage.models.listByProvider(settings.visionFallbackProviderId).then(setVisionModels);
  }, [settings.visionFallbackProviderId]);

  // Assist model options come from the selected assist provider.
  useEffect(() => {
    if (!settings.assistProviderId) return setAssistModels([]);
    Storage.models.listByProvider(settings.assistProviderId).then(setAssistModels);
  }, [settings.assistProviderId]);

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

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.useConversationSummary}
          onChange={(e) =>
            update({ useConversationSummary: (e.target as HTMLInputElement).checked })
          }
        />
        Prepend a conversation's stored summary to context on resume
      </label>

      <div>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.externalAiEnabled}
            onChange={(e) => update({ externalAiEnabled: (e.target as HTMLInputElement).checked })}
          />
          Enable ask_external_ai (experimental)
        </label>
        <p class="mt-1 text-xs text-gray-500">
          Lets the agent drive ChatGPT/Claude/Gemini/Perplexity in a tab and read the reply. You
          must be logged in to those sites. Fragile — depends on each site's layout.
        </p>
      </div>

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
              onChange={(e) => {
                const provId = (e.target as HTMLSelectElement).value || null;
                update({
                  visionFallbackProviderId: provId,
                  visionFallbackModel: null,
                });
              }}
              class={selectCls}
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={settings.visionFallbackModel ?? ''}
              onChange={(e) =>
                update({ visionFallbackModel: (e.target as HTMLSelectElement).value || null })
              }
              class={selectCls}
              disabled={!settings.visionFallbackProviderId}
            >
              <option value="">Select vision model…</option>
              {visionModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} {m.hasVision ? ' 👁️' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </Field>

      <Field label="In-page assist model">
        <select
          value={settings.assistProviderId ?? ''}
          onChange={(e) => {
            const provId = (e.target as HTMLSelectElement).value || null;
            update({ assistProviderId: provId, assistModel: null });
          }}
          class={selectCls}
        >
          <option value="">Use active provider (default)</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {settings.assistProviderId && (
          <select
            value={settings.assistModel ?? ''}
            onChange={(e) =>
              update({ assistModel: (e.target as HTMLSelectElement).value || null })
            }
            class={`${selectCls} mt-2`}
          >
            <option value="">First enabled model</option>
            {assistModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        )}
        <p class="mt-1 text-xs text-gray-500">
          Used by the Highlight Toolbar, Inline Assist, Floating Bubble, and Email Reply. Leave on
          “Use active provider” to follow your selected chat model.
        </p>
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

      <StorageSection />
    </div>
  );
}

/** Storage usage + per-category breakdown (PLAN §41). */
function StorageSection() {
  const [est, setEst] = useState<StorageEstimate | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [persistMsg, setPersistMsg] = useState<string | null>(null);

  const refresh = () => {
    getStorageEstimate().then(setEst);
    getStorageBreakdown().then(setBreakdown);
  };
  useEffect(refresh, []);

  const requestPersist = async () => {
    const granted = await requestPersistentStorage();
    setPersistMsg(granted ? 'Persistent storage granted.' : 'Request denied by the browser.');
  };

  const fmt = (mb: number) => (mb < 0.1 ? '<0.1' : mb.toFixed(1));
  const rows: { label: string; mb: number }[] = breakdown
    ? [
        { label: 'Conversations & messages', mb: breakdown.conversationsMB },
        { label: 'Virtual filesystem', mb: breakdown.filesMB },
        { label: 'Memories & tasks', mb: breakdown.memoriesTasksMB },
        { label: 'Skills', mb: breakdown.skillsMB },
      ]
    : [];

  return (
    <Field label="Storage">
      {est && (
        <div class="mb-2">
          <div class="mb-1 text-xs text-gray-600 dark:text-gray-300">
            Storage used: {fmt(est.usageMB)} MB of {fmt(est.quotaMB)} MB ({est.percent.toFixed(0)}%)
          </div>
          <div class="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
            <div
              class={`h-full ${est.percent > 85 ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, est.percent)}%` }}
            />
          </div>
        </div>
      )}
      <ul class="space-y-0.5 text-xs text-gray-500">
        {rows.map((r) => (
          <li key={r.label} class="flex justify-between">
            <span>{r.label}</span>
            <span>{fmt(r.mb)} MB</span>
          </li>
        ))}
      </ul>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={requestPersist} class={btnCls}>
          Request more storage
        </button>
        <button type="button" onClick={refresh} class={btnCls}>
          Refresh
        </button>
      </div>
      {persistMsg && <p class="mt-1 text-xs text-gray-500">{persistMsg}</p>}
      <p class="mt-1 text-xs text-gray-400">
        To free space: export a backup (Backup tab), then delete large files in the Files tab.
      </p>
    </Field>
  );
}

const btnCls =
  'rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800';

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
