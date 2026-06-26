import { useEffect, useRef, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import type { Model, Provider, ReasoningEffort, Settings } from '@/types';

const selectCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800';

interface Props {
  settings: Settings | null;
  onClose: () => void;
  onChange: (next: Settings) => void;
}

/**
 * Small popup anchored to the bottom toolbar's model label — replaces the old
 * always-visible top SelectorBar. Lets the user pick provider, model, and
 * reasoning effort in one place without taking up permanent header space.
 */
export function ModelPickerPopup({ settings, onClose, onChange }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Storage.providers.list().then(setProviders);
  }, []);

  useEffect(() => {
    if (!settings?.selectedProviderId) {
      setModels([]);
      return;
    }
    Storage.models.listByProvider(settings.selectedProviderId).then(setModels);
  }, [settings?.selectedProviderId]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose]);

  const onProvider = async (pid: string) => {
    const list = await Storage.models.listByProvider(pid);
    setModels(list);
    const m = list[0]?.id ?? '';
    const next = await Storage.settings.update({ selectedProviderId: pid, selectedModel: m });
    onChange(next);
  };

  const onModel = async (m: string) => {
    const next = await Storage.settings.update({ selectedModel: m });
    onChange(next);
  };

  const onEffort = async (effort: ReasoningEffort) => {
    const next = await Storage.settings.update({ reasoningEffort: effort });
    onChange(next);
  };

  const selectedModelInfo = models.find((m) => m.id === settings?.selectedModel);
  const supportsThinking = !!selectedModelInfo?.hasReasoning;
  const isUnknownCapability =
    !!selectedModelInfo && selectedModelInfo.capabilitySource === 'unknown';

  // Manual override (PLAN §6) — same as the Models tab's capability checkbox,
  // but reachable inline so an unverified model can be unblocked without a
  // trip to Settings.
  const markReasoningCapable = async () => {
    if (!settings?.selectedProviderId || !selectedModelInfo) return;
    const updated = models.map((m) =>
      m.id === selectedModelInfo.id
        ? { ...m, hasReasoning: true, capabilitySource: 'user' as const }
        : m,
    );
    setModels(updated);
    await Storage.models.setForProvider(settings.selectedProviderId, updated);
  };

  return (
    <div
      ref={popupRef}
      class="absolute bottom-full right-0 z-10 mb-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      {providers.length === 0 ? (
        <button
          type="button"
          onClick={() => chrome.runtime?.openOptionsPage?.()}
          class="text-left text-sm text-blue-600 hover:underline"
        >
          + Add an AI provider in Settings to get started
        </button>
      ) : (
        <div class="space-y-2">
          <div>
            <div class="mb-1 text-xs text-gray-500">Provider</div>
            <select
              value={settings?.selectedProviderId ?? ''}
              onChange={(e) => onProvider((e.target as HTMLSelectElement).value)}
              class={selectCls}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div class="mb-1 text-xs text-gray-500">Model</div>
            {models.length > 0 ? (
              <select
                value={settings?.selectedModel ?? ''}
                onChange={(e) => onModel((e.target as HTMLSelectElement).value)}
                class={selectCls}
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
                value={settings?.selectedModel ?? ''}
                onInput={(e) => onModel((e.target as HTMLInputElement).value)}
                placeholder="model id"
                class={selectCls}
              />
            )}
          </div>

          <div>
            <div class="mb-1 text-xs text-gray-500">Thinking level</div>
            {supportsThinking ? (
              <select
                value={settings?.reasoningEffort ?? 'medium'}
                onChange={(e) => onEffort((e.target as HTMLSelectElement).value as ReasoningEffort)}
                class={selectCls}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            ) : isUnknownCapability ? (
              <div class="text-xs text-gray-400">
                Reasoning support unverified.{' '}
                <button
                  type="button"
                  onClick={markReasoningCapable}
                  class="text-blue-600 hover:underline"
                >
                  Mark as reasoning-capable
                </button>
              </div>
            ) : (
              <div class="text-xs text-gray-400">
                This model doesn't support adjustable thinking.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
