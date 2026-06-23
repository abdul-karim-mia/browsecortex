import { useEffect, useRef } from 'preact/hooks';
import { Storage } from '@/storage';
import { Icon } from '@/components/Icon';
import type { AgentMode, Settings } from '@/types';

/** The agent modes surfaced in the picker, in display order. Each maps to an
 * `agentMode` value that's already enforced in the agent loop (see
 * agent/loop.ts §28). The number is the 1-based keyboard shortcut. */
const MODES: { mode: AgentMode; label: string; hint: string }[] = [
  { mode: 'ask', label: 'Ask', hint: 'Confirm before destructive actions' },
  {
    mode: 'auto',
    label: 'Auto',
    hint: 'Run everything; confirm after reading web content',
  },
  { mode: 'bypass', label: 'Bypass', hint: 'Run everything, never ask' },
];

interface Props {
  settings: Settings | null;
  onClose: () => void;
  onChange: (next: Settings) => void;
}

/**
 * Mode picker anchored to the bottom toolbar's mode pill. Switches the agent's
 * `agentMode` — the same setting the agent loop reads to decide whether to ask
 * for confirmation before destructive actions.
 */
export function ModePickerPopup({ settings, onClose, onChange }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const current = settings?.agentMode ?? 'bypass';

  const select = async (mode: AgentMode) => {
    const next = await Storage.settings.update({ agentMode: mode });
    onChange(next);
    onClose();
  };

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < MODES.length) {
        e.preventDefault();
        void select(MODES[idx].mode);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      class="absolute bottom-full left-0 z-10 mb-2 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <div class="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Mode</div>
      {MODES.map(({ mode, label, hint }, i) => (
        <button
          key={mode}
          type="button"
          onClick={() => void select(mode)}
          title={hint}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <span class="flex-1">{label}</span>
          {current === mode && <Icon name="check" size={14} />}
          <span class="text-xs text-gray-400 dark:text-gray-500">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
